// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.20;

/******************************************************************************\
* Author: Achthar | 1delta 
/******************************************************************************/

import {MarginCallbackData} from "../../dataTypes/InputTypes.sol";
import "../../../periphery-standalone/interfaces/IMinimalSwapRouter.sol";

import {SafeCast} from "../../dex-tools/uniswap/core/SafeCast.sol";
import {IUniswapV3Pool} from "../../dex-tools/uniswap/core/IUniswapV3Pool.sol";
import {ISwapRouter} from "../../dex-tools/uniswap/interfaces/ISwapRouter.sol";
import {PeripheryValidation} from "../../dex-tools/uniswap/base/PeripheryValidation.sol";
import {PeripheryPaymentsWithFee} from "../../dex-tools/uniswap/base/PeripheryPaymentsWithFee.sol";
import {SelfPermit} from "../../dex-tools/uniswap/base/SelfPermit.sol";
import {Path} from "../../dex-tools/uniswap/libraries/Path.sol";
import {PoolAddressCalculator} from "../../dex-tools/uniswap/libraries/PoolAddressCalculator.sol";
import {CallbackValidation} from "../../dex-tools/uniswap/libraries/CallbackValidation.sol";
import {IUniswapV3SwapCallback} from "../../dex-tools/uniswap/core/IUniswapV3SwapCallback.sol";
import {CallbackData} from "../../dex-tools/uniswap/DataTypes.sol";

import {IERC20} from "../../interfaces/IERC20.sol";
import {WithStorage} from "../../libraries/LibStorage.sol";
import "./BaseLendingHandler.sol";
import {UniswapDataHolder} from "../utils/UniswapDataHolder.sol";

// solhint-disable max-line-length

/**
 * @title Uniswap Callback Base contract
 * @notice Contains main logic for uniswap callbacks
 */
abstract contract BaseUniswapV3CallbackModule is IUniswapV3SwapCallback, WithStorage, UniswapDataHolder, BaseLendingHandler {
    using Path for bytes;
    using SafeCast for uint256;

    /// @dev MIN_SQRT_RATIO + 1 from Uniswap's TickMath
    uint160 private immutable MIN_SQRT_RATIO = 4295128740;
    /// @dev MAX_SQRT_RATIO - 1 from Uniswap's TickMath
    uint160 private immutable MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970341;

    /// @dev Returns the pool for the given token pair and fee. The pool contract may or may not exist.
    function getUniswapV3Pool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) private view returns (IUniswapV3Pool) {
        return IUniswapV3Pool(PoolAddressCalculator.computeAddress(v3Factory, tokenA, tokenB, fee));
    }

    constructor(
        address _factory,
        address _nativeWrapper,
        address _router
    ) BaseLendingHandler(_nativeWrapper) UniswapDataHolder(_factory, _router) {}

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata _data
    ) external override {
        MarginCallbackData memory data = abi.decode(_data, (MarginCallbackData));

        uint256 tradeType = data.tradeType;

        (address tokenIn, address tokenOut, uint24 fee, bool hasMore) = data.path.decodeFirstPoolAndValidateLength();
        CallbackValidation.verifyCallback(v3Factory, tokenIn, tokenOut, fee);

        // EXACT IN BASE SWAP
        if (tradeType == 99) {
            uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
            pay(tokenIn, address(this), amountToPay);
        }
        // COLLATERAL SWAPS
        else if (tradeType == 4) {
            if (data.exactIn) {
                (uint256 amountToWithdraw, uint256 amountToSwap) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                if (hasMore) {
                    // we need to swap to the token that we want to supply
                    // the router returns the amount that we can finally supply to the protocol
                    data.path = data.path.skipToken();
                    amountToSwap = exactInputToSelf(amountToSwap, data);

                    // supply directly
                    tokenOut = data.path.getLastToken();
                }
                // cache amount
                cs().amount = amountToSwap;

                mintPrivate(tokenOut, amountToSwap);

                // withraw and send funds to the pool
                redeemPrivate(tokenIn, amountToWithdraw, msg.sender);
            } else {
                // multi swap exact out
                (uint256 amountInLastPool, uint256 amountToSupply) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));
                // we supply the amount received directly - together with user provided amount
                mintPrivate(tokenIn, amountToSupply);
                // we then swap exact out where the first amount is
                // borrowed and paid from the money market
                // the received amount is paid back to the original pool
                if (hasMore) {
                    data.path = data.path.skipToken();
                    (tokenOut, tokenIn, fee) = data.path.decodeFirstPool();

                    data.tradeType = 14;
                    bool zeroForOne = tokenIn < tokenOut;

                    getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                        msg.sender,
                        zeroForOne,
                        -amountInLastPool.toInt256(),
                        zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                        abi.encode(data)
                    );
                } else {
                    // cache amount
                    cs().amount = amountInLastPool;
                    redeemPrivate(tokenOut, amountInLastPool, msg.sender);
                }
            }
            return;
        }
        // EXACT OUT - WITHDRAW
        else if (tradeType == 14) {
            // multi swap exact out
            uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
            // either initiate the next swap or pay
            if (hasMore) {
                data.path = data.path.skipToken();
                (tokenOut, tokenIn, fee) = data.path.decodeFirstPool();

                bool zeroForOne = tokenIn < tokenOut;

                getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                    msg.sender,
                    zeroForOne,
                    -amountToPay.toInt256(),
                    zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                    abi.encode(data)
                );
            } else {
                tokenIn = tokenOut; // swap in/out because exact output swaps are reversed
                // withraw and send funds to the pool
                redeemPrivate(tokenOut, amountToPay, msg.sender);
                // cache amount
                cs().amount = amountToPay;
            }
            return;
        }
        // OPEN MARGIN
        else if (tradeType == 8) {
            if (data.exactIn) {
                // multi swap exact in
                (uint256 amountToBorrow, uint256 amountToSwap) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                if (hasMore) {
                    // we need to swap to the token that we want to supply
                    // the router returns the amount that we can finally supply to the protocol
                    data.path = data.path.skipToken();
                    amountToSwap = exactInputToSelf(amountToSwap, data);
                    tokenOut = data.path.getLastToken();
                }

                // cache amount
                cs().amount = amountToSwap;

                mintPrivate(tokenOut, amountToSwap);

                // borrow and repay amount from the lending pool
                borrowPrivate(tokenIn, amountToBorrow, msg.sender);

                return;
            } else {
                // multi swap exact out
                (uint256 amountInLastPool, uint256 amountToSupply) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                // we supply the amount received directly - together with user provided amount
                mintPrivate(tokenIn, amountToSupply);

                if (hasMore) {
                    // we then swap exact out where the first amount is
                    // borrowed and paid from the money market
                    // the received amount is paid back to the original pool
                    data.path = data.path.skipToken();
                    (tokenOut, tokenIn, fee) = data.path.decodeFirstPool();
                    data.tradeType = 13;
                    bool zeroForOne = tokenIn < tokenOut;

                    getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                        msg.sender,
                        zeroForOne,
                        -amountInLastPool.toInt256(),
                        zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                        abi.encode(data)
                    );
                } else {
                    // cache amount
                    cs().amount = amountInLastPool;
                    borrowPrivate(tokenOut, amountInLastPool, msg.sender);
                }

                return;
            }
        }
        // DEBT SWAP
        else if (tradeType == 2) {
            if (data.exactIn) {
                (uint256 amountToBorrow, uint256 amountToSwap) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));
                if (hasMore) {
                    // we need to swap to the token that we want to repay
                    // the router returns the amount that we can finally repay to the protocol
                    data.path = data.path.skipToken();
                    amountToSwap = exactInputToSelf(amountToSwap, data);
                    tokenOut = data.path.getLastToken();
                }
                // cache amount
                cs().amount = amountToSwap;
                repayPrivate(tokenOut, amountToSwap);
                borrowPrivate(tokenIn, amountToBorrow, msg.sender);

                return;
            } else {
                // multi swap exact out
                (uint256 amountInLastPool, uint256 amountToSupply) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                // we repay the amount received directly
                repayPrivate(tokenIn, amountToSupply);
                if (hasMore) {
                    // we then swap exact out where the first amount is
                    // borrowed and paid from the money market
                    // the received amount is paid back to the original pool

                    data.path = data.path.skipToken();
                    (tokenOut, tokenIn, fee) = data.path.decodeFirstPool();
                    data.tradeType = 13;
                    bool zeroForOne = tokenIn < tokenOut;

                    getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                        msg.sender,
                        zeroForOne,
                        -amountInLastPool.toInt256(),
                        zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                        abi.encode(data)
                    );
                } else {
                    // cache amount
                    cs().amount = amountInLastPool;
                    borrowPrivate(tokenOut, amountInLastPool, msg.sender);
                }
                return;
            }
        }
        // EXACT OUT - BORROW
        else if (tradeType == 13) {
            // multi swap exact out
            uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
            // either initiate the next swap or pay
            if (hasMore) {
                data.path = data.path.skipToken();
                (tokenOut, tokenIn, fee) = data.path.decodeFirstPool();

                bool zeroForOne = tokenIn < tokenOut;

                getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                    msg.sender,
                    zeroForOne,
                    -amountToPay.toInt256(),
                    zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                    abi.encode(data)
                );
            } else {
                tokenIn = tokenOut; // swap in/out because exact output swaps are reversed
                // borrow and repay pool
                borrowPrivate(tokenIn, amountToPay, msg.sender);
                // cache amount
                cs().amount = amountToPay;
            }
            return;
        }
        // TRIM
        else if (tradeType == 10) {
            if (data.exactIn) {
                // trim position exact in
                (uint256 amountToWithdraw, uint256 amountToSwap) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));
                if (hasMore) {
                    // we need to swap to the token that we want to repay
                    // the router returns the amount that we can use to repay
                    data.path = data.path.skipToken();
                    amountToSwap = exactInputToSelf(amountToSwap, data);

                    tokenOut = data.path.getLastToken();
                }
                // cache amount
                cs().amount = amountToSwap;
                // lending protocol underlyings are approved by default
                repayPrivate(tokenOut, amountToSwap);

                // withraw from cToken
                redeemPrivate(tokenIn, amountToWithdraw, msg.sender);

                return;
            } else {
                // multi swap exact out
                (uint256 amountInLastPool, uint256 amountToRepay) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                // repay
                repayPrivate(tokenIn, amountToRepay);

                if (hasMore) {
                    // we then swap exact out where the first amount is
                    // withdrawn from the lending protocol pool and paid back to the pool
                    data.path = data.path.skipToken();
                    (tokenOut, tokenIn, fee) = data.path.decodeFirstPool();
                    data.tradeType = 14;
                    bool zeroForOne = tokenIn < tokenOut;

                    getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                        msg.sender,
                        zeroForOne,
                        -amountInLastPool.toInt256(),
                        zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                        abi.encode(data)
                    );
                } else {
                    // cache amount
                    cs().amount = amountToRepay;
                    redeemPrivate(tokenOut, amountInLastPool, msg.sender);
                }
                return;
            }
        }
        // EXACT OUT - PAID BY USER
        else if (tradeType == 12) {
            // multi swap exact out
            uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
            // either initiate the next swap or pay
            if (hasMore) {
                data.path = data.path.skipToken();
                (tokenOut, tokenIn, fee) = data.path.decodeFirstPool();

                bool zeroForOne = tokenIn < tokenOut;

                getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                    msg.sender,
                    zeroForOne,
                    -amountToPay.toInt256(),
                    zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                    abi.encode(data)
                );
            } else {
                tokenIn = tokenOut; // swap in/out because exact output swaps are reversed
                pay(tokenIn, cs().cachedAddress, amountToPay);
                // cache amount
                cs().amount = amountToPay;
            }
            return;
        }

        return;
    }

    function exactInputToSelf(uint256 amountIn, MarginCallbackData memory data) internal returns (uint256 amountOut) {
        while (true) {
            bool hasMultiplePools = data.path.hasMultiplePools();

            MarginCallbackData memory exactInputData;
            exactInputData.path = data.path.getFirstPool();
            exactInputData.tradeType = 99;

            (address tokenIn, address tokenOut, uint24 fee) = exactInputData.path.decodeFirstPool();

            bool zeroForOne = tokenIn < tokenOut;
            (int256 amount0, int256 amount1) = getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                address(this),
                zeroForOne,
                amountIn.toInt256(),
                zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                abi.encode(exactInputData)
            );

            amountIn = uint256(-(zeroForOne ? amount1 : amount0));

            // decide whether to continue or terminate
            if (hasMultiplePools) {
                data.path = data.path.skipToken();
            } else {
                amountOut = amountIn;
                break;
            }
        }
    }
}

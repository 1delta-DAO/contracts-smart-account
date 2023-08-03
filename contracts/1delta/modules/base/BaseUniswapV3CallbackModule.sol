// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.21;

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
import {TokenTransfer} from "../../libraries/TokenTransfer.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {WithStorage} from "../../libraries/LibStorage.sol";
import {UniswapDataHolder} from "../utils/UniswapDataHolder.sol";
import {TokenTransfer} from "../../libraries/TokenTransfer.sol";
import {LendingInteractions} from "../../libraries/LendingInteractions.sol";

// solhint-disable max-line-length

/**
 * @title Uniswap Callback Base contract
 * @notice Contains main logic for uniswap callbacks
 */
abstract contract BaseUniswapV3CallbackModule is IUniswapV3SwapCallback, WithStorage, UniswapDataHolder, TokenTransfer, LendingInteractions  {
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
        address _cNative
    ) UniswapDataHolder(_factory, _cNative) LendingInteractions(_cNative, _nativeWrapper){}

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
                address cIn;
                (cIn, tokenOut) = cTokenPair(tokenIn, tokenOut);
                _mint(tokenOut, amountToSwap);

                // withraw and send funds to the pool
                _redeemUnderlying(cIn, amountToWithdraw);
                _transferERC20Tokens(tokenIn, msg.sender, amountToWithdraw);
            } else {
                // multi swap exact out
                (uint256 amountInLastPool, uint256 amountToSupply) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));
                // we supply the amount received directly - together with user provided amount
                _mint(cTokenAddress(tokenIn), amountToSupply);
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
                    tokenIn = cTokenAddress(tokenOut);  
                    _redeemUnderlying(tokenIn, amountInLastPool);
                    _transferERC20Tokens(tokenOut, msg.sender, amountInLastPool);
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
                tokenIn = cTokenAddress(tokenOut); // swap in/out because exact output swaps are reversed
                // withraw and send funds to the pool
                _redeemUnderlying(tokenIn, amountToPay);
                _transferERC20Tokens(tokenOut, msg.sender, amountToPay);
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
                address cIn;
                (cIn, tokenOut) = cTokenPair(tokenIn, tokenOut);
                _mint(tokenOut, amountToSwap);
                // borrow and repay amount from the lending pool
                _borrow(cIn, amountToBorrow);
                _transferERC20Tokens(tokenIn, msg.sender, amountToBorrow);

                return;
            } else {
                // multi swap exact out
                (uint256 amountInLastPool, uint256 amountToSupply) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                // we supply the amount received directly - together with user provided amount
                _mint(cTokenAddress(tokenIn), amountToSupply);

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
                    tokenIn = cTokenAddress(tokenOut);
                    _borrow(tokenIn, amountInLastPool);
                    _transferERC20Tokens(tokenOut, msg.sender, amountInLastPool);
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
                address cIn;
                (cIn, tokenOut) = cTokenPair(tokenIn, tokenOut);
                _repayBorrow(tokenOut, amountToSwap);
                _borrow(cIn, amountToBorrow);
                _transferERC20Tokens(tokenIn, msg.sender, amountToBorrow);

                return;
            } else {
                // multi swap exact out
                (uint256 amountInLastPool, uint256 amountToSupply) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                // we repay the amount received directly
                _repayBorrow(cTokenAddress(tokenIn), amountToSupply);
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
                    tokenIn = cTokenAddress(tokenOut);
                    _borrow(tokenIn, amountInLastPool);
                    _transferERC20Tokens(tokenOut, msg.sender, amountInLastPool);
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
                tokenOut = cTokenAddress(tokenOut);
                // borrow and repay pool
                _borrow(tokenOut, amountToPay);
                _transferERC20Tokens(tokenIn, msg.sender, amountToPay);
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

                address cIn;
                (cIn, tokenOut) = cTokenPair(tokenIn, tokenOut);
                // lending protocol underlyings are approved by default
                _repayBorrow(tokenOut, amountToSwap);
                // withraw from cToken
                _redeemUnderlying(cIn, amountToWithdraw);
                _transferERC20Tokens(tokenIn, msg.sender, amountToWithdraw);

                return;
            } else {
                // multi swap exact out
                (uint256 amountInLastPool, uint256 amountToRepay) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                // repay
                _repayBorrow(cTokenAddress(tokenIn), amountToRepay);

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
                    tokenIn = cTokenAddress(tokenOut);
                    _redeemUnderlying(tokenIn, amountInLastPool);
                    _transferERC20Tokens(tokenOut, msg.sender, amountInLastPool);
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
        /// @param token The token to pay
    /// @param payer The entity that must pay
    /// @param value The amount to pay
    function pay(
        address token,
        address payer,
        uint256 value
    ) internal {
        address _nativeWrapper = wNative;
        if (token == _nativeWrapper && address(this).balance >= value) {
            // pay with nativeWrapper
            _depositWeth(_nativeWrapper, value); // wrap only what is needed to pay
            _transferERC20Tokens(_nativeWrapper, msg.sender, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            _transferERC20Tokens(token, msg.sender, value);
        } else {
            // pull payment
            _transferERC20TokensFrom(token, payer, msg.sender, value);
        }
    }

    function cTokenAddress(address underlying) internal view virtual returns (address);

    function cTokenPair(address underlying, address underlyingOther) internal view virtual returns (address, address);
}

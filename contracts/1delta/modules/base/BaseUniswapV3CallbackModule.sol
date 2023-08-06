// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.21;

/******************************************************************************\
* Author: Achthar | 1delta 
/******************************************************************************/

import {SafeCast} from "../../dex-tools/uniswap/core/SafeCast.sol";
import {PoolAddressCalculator} from "../../dex-tools/uniswap/libraries/PoolAddressCalculator.sol";
import {IUniswapV3SwapCallback} from "../../dex-tools/uniswap/core/IUniswapV3SwapCallback.sol";
import {TokenTransfer} from "../../libraries/TokenTransfer.sol";
import {WithStorage} from "../../libraries/LibStorage.sol";
import {UniswapDataHolder} from "../utils/UniswapDataHolder.sol";
import {TokenTransfer} from "../../libraries/TokenTransfer.sol";
import {LendingInteractions} from "../../libraries/LendingInteractions.sol";
import {BaseSwapper} from "./BaseSwapper.sol";

// solhint-disable max-line-length

/**
 * @title Uniswap Callback Base contract
 * @notice Contains main logic for uniswap callbacks
 */
abstract contract BaseUniswapV3CallbackModule is
    IUniswapV3SwapCallback,
    WithStorage,
    UniswapDataHolder,
    TokenTransfer,
    LendingInteractions,
    BaseSwapper
{
    using SafeCast for uint256;

    /// @dev MIN_SQRT_RATIO + 1 from Uniswap's TickMath
    uint160 private immutable MIN_SQRT_RATIO = 4295128740;
    /// @dev MAX_SQRT_RATIO - 1 from Uniswap's TickMath
    uint160 private immutable MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970341;

    constructor(
        address _factory,
        address _nativeWrapper,
        address _cNative
    ) UniswapDataHolder(_factory, _cNative) LendingInteractions(_cNative, _nativeWrapper) BaseSwapper(_factory) {}

    // path identification
    // 0: exact input swap
    // 1 exact output swap - flavored by the id given at the end of the path
    // 4: borrow
    // 3: withdraw
    // 5: deposit funds
    // 6: repay funds

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes memory _data
    ) external override {
        uint256 cache; // cache value
        uint8 identifier;
        address tokenIn;
        uint24 fee;
        address tokenOut;
        uint256 tradeId;
        assembly {
            tokenIn := div(mload(add(add(_data, 0x20), 0)), 0x1000000000000000000000000)
            fee := mload(add(add(_data, 0x3), 20))
            identifier := mload(add(add(_data, 0x1), 23)) // identifier for poolId
            tokenOut := div(mload(add(add(_data, 0x20), 25)), 0x1000000000000000000000000)
        }
        {
            require(msg.sender == address(getUniswapV3Pool(tokenIn, tokenOut, fee)));
        }

        assembly {
            identifier := mload(add(add(_data, 0x1), 24)) // identifier for  tradeType
        }
        tradeId = identifier;
        // EXACT IN BASE SWAP
        if (tradeId == 0) {
            cache = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
            pay(tokenIn, address(this), cache);
        }
        // EXACT OUT - WITHDRAW or BORROW
        else if (tradeId == 1) {
            cache = _data.length;
            // multi swap exact out
            uint256 amountToPay = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
            // either initiate the next swap or pay
            if (cache > 46) {
                _data = skipToken(_data);
                (tokenOut, tokenIn, fee) = decodeFirstPool(_data);

                bool zeroForOne = tokenIn < tokenOut;

                getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                    msg.sender,
                    zeroForOne,
                    -amountToPay.toInt256(),
                    zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                    _data
                );
            } else {
                assembly {
                    identifier := mload(add(add(_data, 0x1), sub(cache, 1))) // identifier for borrow/withdraw
                }
                tradeId = identifier;

                if (tradeId == 6) {
                    tokenIn = cTokenAddress(tokenOut);
                    // borrow and repay pool
                    _borrow(tokenIn, amountToPay);
                    _transferERC20Tokens(tokenOut, msg.sender, amountToPay);
                } else {
                    tokenIn = cTokenAddress(tokenOut);
                    // withraw and send funds to the pool
                    _redeemUnderlying(tokenIn, amountToPay);
                    _transferERC20Tokens(tokenOut, msg.sender, amountToPay);
                }
                // cache amount
                cs().amount = amountToPay;
            }
            return;
        }
        // MARGIN TRADING INTERACTIONS
        else {
            // fetch identifier at the end of the path
            cache = _data.length;
            // exact in
            if (tradeId > 5) {
                (uint256 amountToRepayToPool, uint256 amountToSwap) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));

                if (cache > 46) {
                    // we need to swap to the token that we want to supply
                    // the router returns the amount that we can finally supply to the protocol
                    _data = skipToken(_data);
                    amountToSwap = exactInputToSelf(amountToSwap, _data);
                    // supply directly
                    tokenOut = getLastToken(_data);
                    // update length
                    cache = _data.length;
                }
                // cache amount
                cs().amount = amountToSwap;
                address cIn;
                (cIn, tokenOut) = cTokenPair(tokenIn, tokenOut);
                // 6 is mint / deposit
                if (tradeId == 6) {
                    _mint(tokenOut, amountToSwap);
                } else {
                    _repayBorrow(tokenOut, amountToSwap);
                }

                // fetch the flag for closing the trade
                assembly {
                    identifier := mload(add(add(_data, 0x1), sub(cache, 1)))
                }
                tradeId = identifier;
                // 6 is borrow
                if (tradeId == 6) {
                    _borrow(cIn, amountToRepayToPool);
                    _transferERC20Tokens(tokenIn, msg.sender, amountToRepayToPool);
                } else {
                    // withraw and send funds to the pool
                    _redeemUnderlying(cIn, amountToRepayToPool);
                    _transferERC20Tokens(tokenIn, msg.sender, amountToRepayToPool);
                }
            } else {
                // exact out
                (uint256 amountInLastPool, uint256 amountToSupply) = amount0Delta > 0
                    ? (uint256(amount0Delta), uint256(-amount1Delta))
                    : (uint256(amount1Delta), uint256(-amount0Delta));
                // 4 is deposit
                if (tradeId == 4) {
                    _mint(cTokenAddress(tokenIn), amountToSupply);
                } else {
                    // 3 is repay
                    _repayBorrow(cTokenAddress(tokenIn), amountToSupply);
                }
                // multihop if required
                if (cache > 46) {
                    _data = skipToken(_data);
                    (tokenOut, tokenIn, fee) = decodeFirstPool(_data);

                    bool zeroForOne = tokenIn < tokenOut;

                    getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                        msg.sender,
                        zeroForOne,
                        -amountInLastPool.toInt256(),
                        zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                        _data
                    );
                } else {
                    // cache amount
                    cs().amount = amountInLastPool;
                    tokenIn = cTokenAddress(tokenOut);
                    // fetch the flag for closing the trade
                    assembly {
                        identifier := mload(add(add(_data, 0x1), sub(cache, 1)))
                    }
                    tradeId = identifier;

                    // borrow to pay pool
                    if (tradeId == 6) {
                        _borrow(tokenIn, amountInLastPool);
                        _transferERC20Tokens(tokenOut, msg.sender, amountInLastPool);
                    } else {
                        _redeemUnderlying(tokenIn, amountInLastPool);
                        _transferERC20Tokens(tokenOut, msg.sender, amountInLastPool);
                    }
                }
            }
            return;
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
        if (payer == address(this)) {
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

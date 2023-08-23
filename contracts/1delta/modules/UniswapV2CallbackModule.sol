// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.21;

// solhint-disable max-line-length

import {IDataProvider} from "../interfaces/IDataProvider.sol";
import {IUniswapV2Pair} from "../../external-protocols/uniswapV2/core/interfaces/IUniswapV2Pair.sol";
import {BytesLib} from "../libraries/BytesLib.sol";
import {WithStorage} from "../libraries/LibStorage.sol";
import {LendingInteractions} from "../libraries/LendingInteractions.sol";
import {BaseSwapper} from "./base/BaseSwapper.sol";

contract UniswapV2CallbackModule is BaseSwapper, WithStorage, LendingInteractions {
    using BytesLib for bytes;
    error Slippage();

    constructor(
        address _uniFactory,
        address _uniFactoryV3,
        address _nativeWrapper,
        address _cNative
    ) LendingInteractions(_cNative, _nativeWrapper) BaseSwapper(_uniFactory, _uniFactoryV3) {}

    function getAmountOutDirect(
        address pair,
        bool zeroForOne,
        uint256 sellAmount
    ) private view returns (uint256 buyAmount) {
        assembly {
            // Call pair.getReserves(), store the results at `0xC00`
            mstore(0xB00, 0x0902f1ac00000000000000000000000000000000000000000000000000000000)
            if iszero(staticcall(gas(), pair, 0xB00, 0x4, 0xC00, 0x40)) {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
            // Revert if the pair contract does not return at least two words.
            if lt(returndatasize(), 0x40) {
                revert(0, 0)
            }

            // Compute the buy amount based on the pair reserves.
            {
                let sellReserve
                let buyReserve
                switch iszero(zeroForOne)
                case 0 {
                    // Transpose if pair order is different.
                    sellReserve := mload(0xC00)
                    buyReserve := mload(0xC20)
                }
                default {
                    sellReserve := mload(0xC20)
                    buyReserve := mload(0xC00)
                }
                // Pairs are in the range (0, 2¹¹²) so this shouldn't overflow.
                // buyAmount = (pairSellAmount * 997 * buyReserve) /
                //     (pairSellAmount * 997 + sellReserve * 1000);
                let sellAmountWithFee := mul(sellAmount, 997)
                buyAmount := div(mul(sellAmountWithFee, buyReserve), add(sellAmountWithFee, mul(sellReserve, 1000)))
            }
        }
    }

    function swapV3(
        uint256 amountIn,
        address tokenIn,
        address tokenOut
    ) external {
        uint160 limit = MAX_SQRT_RATIO;
        assembly {
            let zeroForOne := lt(tokenIn, tokenOut)
            // selector for swap(...)
            mstore(0xB00, 0x128acb0800000000000000000000000000000000000000000000000000000000)
            mstore(0xB04, address()) // recipient
            mstore(0xB24, zeroForOne) // bool flag
            mstore(0xB44, amountIn) // amount
            mstore(0xB64, limit) // limit
            mstore(0xB84, 0xA0) // bytes
            mstore(0xBA4, 0) // bytesdata

            if iszero(
                call(
                    gas(),
                    address(),
                    0x0,
                    0xB00, // input selector
                    0xC4, // input size = selector plus uint256
                    0xB00, // output
                    0x40 // output size = 64
                )
            ) {
                // Forward the error
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
    }

    // path is encoded as addresses glued together

    function uniswapV2Call(
        address,
        uint256 amount0,
        uint256 amount1,
        bytes memory data
    ) external {
        uint256 cache;
        uint8 tradeId;
        address tokenIn;
        address tokenOut;
        bool zeroForOne;
        uint8 identifier;
        {
            uint24 fee;
            assembly {
                tokenIn := div(mload(add(add(data, 0x20), 0)), 0x1000000000000000000000000)
                fee := mload(add(add(data, 0x3), 20)) // uniswapV3 style fee
                identifier := mload(add(add(data, 0x1), 23)) // uniswap fork identifier
                tradeId := mload(add(add(data, 0x1), 24)) // interaction identifier
                tokenOut := div(mload(add(add(data, 0x20), 25)), 0x1000000000000000000000000)
                zeroForOne := lt(tokenIn, tokenOut)
            }
        }

        // calculate pool address
        address pool = pairAddress(tokenIn, tokenOut);
        {
            // validate sender
            require(msg.sender == pool);
        }
        // store identifier for tradeType in identifier variable
        assembly {
            identifier := mload(add(add(data, 0x1), 24)) // identifier for  tradeType
        }
        cache = data.length;
        if (tradeId == 1) {
            cache = data.length;
            // fetch amountOut
            uint256 referenceAmount = zeroForOne ? amount0 : amount1;
            // calculte amountIn
            referenceAmount = getAmountInDirect(pool, zeroForOne, referenceAmount);
            // either initiate the next swap or pay
            if (cache > 46) {
                data = skipToken(data);
                flashSwapExactOut(referenceAmount, data);
            } else {
                assembly {
                    identifier := mload(add(add(data, 0x1), sub(cache, 1))) // identifier for borrow/withdraw
                }
                tradeId = identifier;

                if (tradeId == 6) {
                    tokenIn = cTokenAddress(tokenOut);
                    // borrow and repay pool
                    _borrow(tokenIn, referenceAmount);
                    _transferERC20Tokens(tokenOut, msg.sender, referenceAmount);
                } else {
                    tokenIn = cTokenAddress(tokenOut);
                    // withraw and send funds to the pool
                    _redeemUnderlying(tokenIn, referenceAmount);
                    _transferERC20Tokens(tokenOut, msg.sender, referenceAmount);
                }
                // cache amount
                cs().amount = referenceAmount;
            }
            return;
        }
        if (tradeId > 5) {
            // the swap amount is expected to be the nonzero output amount
            // since v2 does not send the input amount as parameter, we have to fetch
            // the other amount manually through the cache
            (uint256 amountToSwap, uint256 amountToBorrow) = zeroForOne ? (amount1, cs().amount) : (amount0, cs().amount);
            if (cache > 46) {
                // we need to swap to the token that we want to supply
                // the router returns the amount that we can finally supply to the protocol
                data = skipToken(data);
                amountToSwap = swapExactIn(amountToSwap, data);
                // supply directly
                tokenOut = getLastToken(data);
                // update length
                cache = data.length;
            }
            // cache amount
            cs().amount = amountToSwap;
            (pool, tokenOut) = cTokenPair(tokenIn, tokenOut);
            // 6 is mint / deposit
            if (tradeId == 6) {
                _mint(tokenOut, amountToSwap);
            } else {
                _repayBorrow(tokenOut, amountToSwap);
            }

            // fetch the flag for closing the trade
            assembly {
                identifier := mload(add(add(data, 0x1), sub(cache, 1)))
            }
            tradeId = identifier;
            // 6 is borrow
            if (tradeId == 6) {
                _borrow(pool, amountToBorrow);
                _transferERC20Tokens(tokenIn, msg.sender, amountToBorrow);
            } else {
                // withraw and send funds to the pool
                _redeemUnderlying(pool, amountToBorrow);
                _transferERC20Tokens(tokenIn, msg.sender, amountToBorrow);
            }
        } else {
            // fetch amountOut
            uint256 referenceAmount = zeroForOne ? amount0 : amount1;
            // 4 is deposit
            if (tradeId == 4) {
                _mint(cTokenAddress(tokenIn), referenceAmount);
            } else {
                // 3 is repay
                _repayBorrow(cTokenAddress(tokenIn), referenceAmount);
            }
            // calcultae amountIn
            referenceAmount = getAmountInDirect(pool, zeroForOne, referenceAmount);
            // constinue swapping if more data is provided
            if (cache > 46) {
                data = skipToken(data);
                flashSwapExactOut(referenceAmount, data);
            } else {
                // cache amount
                cs().amount = referenceAmount;
                tokenIn = cTokenAddress(tokenOut);
                // fetch the flag for closing the trade
                assembly {
                    identifier := mload(add(add(data, 0x1), sub(cache, 1)))
                }
                tradeId = identifier;

                // borrow to pay pool
                if (tradeId == 6) {
                    _borrow(tokenIn, referenceAmount);
                    _transferERC20Tokens(tokenOut, msg.sender, referenceAmount);
                } else {
                    _redeemUnderlying(tokenIn, referenceAmount);
                    _transferERC20Tokens(tokenOut, msg.sender, referenceAmount);
                }
            }
        }
    }

    function cTokenPair(address underlying, address underlyingOther) internal view returns (address, address) {
        return IDataProvider(ps().dataProvider).cTokenPair(underlying, underlyingOther);
    }

    function cTokenAddress(address underlying) internal view returns (address) {
        return IDataProvider(ps().dataProvider).cTokenAddress(underlying);
    }
}

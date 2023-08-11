// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.21;

// solhint-disable max-line-length

import {MarginCallbackData, ExactInputMultiParams, ExactOutputMultiParams, MarginSwapParamsMultiExactIn} from "../../dataTypes/InputTypes.sol";
import "../../../external-protocols/uniswapV2/core/interfaces/IUniswapV2Pair.sol";
import {TokenTransfer} from "./../../libraries/TokenTransfer.sol";
import {IERC20} from "../../../interfaces/IERC20.sol";
import {BytesLib} from "../../libraries/BytesLib.sol";
import {WithStorage} from "../../libraries/LibStorage.sol";
import {LendingInteractions} from "../../libraries/LendingInteractions.sol";

abstract contract BaseUniswapV2CallbackModule is TokenTransfer, WithStorage, LendingInteractions {
    using BytesLib for bytes;
    error Slippage();

    address immutable v2Factory;

    uint256 private constant DEFAULT_AMOUNT_CACHED = type(uint256).max;

    bytes32 constant CODE_HASH_UNI_V2 = 0xf2a343db983032be4e17d2d9d614e0dd9a305aed3083e6757c5bb8e2ab607abe;
    uint256 private constant ADDRESS_MASK = 0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff;

    bytes32 private immutable FF_UNISWAP_FACTORY;

    constructor(
        address _uniFactory,
        address _nativeWrapper,
        address _cNative
    ) LendingInteractions(_cNative, _nativeWrapper) {
        v2Factory = _uniFactory;
        FF_UNISWAP_FACTORY = bytes32((uint256(0xff) << 248) | (uint256(uint160(_uniFactory)) << 88));
    }

    function getFirstPool(bytes memory path) internal pure returns (bytes memory) {
        return path.slice(0, 45);
    }

    function skipToken(bytes memory path) internal pure returns (bytes memory) {
        return path.slice(25, path.length - 25);
    }

    function getLastToken(bytes memory data) internal pure returns (address token) {
        // fetches the last token
        uint256 len = data.length;
        assembly {
            token := div(mload(add(add(data, 0x20), sub(len, 21))), 0x1000000000000000000000000)
        }
    }

    function pairAddress(address tokenA, address tokenB) private view returns (address pair) {
        bytes32 ff_uni = FF_UNISWAP_FACTORY;
        assembly {
            // There is one contract for every combination of tokens,
            // which is deployed using CREATE2.
            // The derivation of this address is given by:
            //   address(keccak256(abi.encodePacked(
            //       bytes(0xFF),
            //       address(UNISWAP_FACTORY_ADDRESS),
            //       keccak256(abi.encodePacked(
            //           tokenA < tokenB ? tokenA : tokenB,
            //           tokenA < tokenB ? tokenB : tokenA,
            //       )),
            //       bytes32(UNISWAP_PAIR_INIT_CODE_HASH),
            //   )));

            // Compute the salt (the hash of the sorted tokens).
            // Tokens are written in reverse memory order to packed encode
            // them as two 20-byte values in a 40-byte chunk of memory
            // starting at 0xB0C.
            switch lt(tokenA, tokenB)
            case 0 {
                mstore(0xB14, tokenA)
                mstore(0xB00, tokenB)
            }
            default {
                mstore(0xB14, tokenB)
                mstore(0xB00, tokenA)
            }
            let salt := keccak256(0xB0C, 0x28)
            // Compute the pair address by hashing all the components together.

            mstore(0xB00, ff_uni)
            mstore(0xB15, salt)
            mstore(0xB35, CODE_HASH_UNI_V2)

            pair := and(ADDRESS_MASK, keccak256(0xB00, 0x55))
        }
    }

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

    function getAmountInDirect(
        address pair,
        bool zeroForOne,
        uint256 buyAmount
    ) private view returns (uint256 sellAmount) {
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
                    sellReserve := mload(0xC20)
                    buyReserve := mload(0xC00)
                }
                default {
                    sellReserve := mload(0xC00)
                    buyReserve := mload(0xC20)
                }
                // Pairs are in the range (0, 2¹¹²) so this shouldn't overflow.
                // sellAmount = (reserveIn * amountOut * 1000) /
                //     ((reserveOut - amountOut) * 997) + 1;
                sellAmount := add(div(mul(mul(sellReserve, buyAmount), 1000), mul(sub(buyReserve, buyAmount), 997)), 1)
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
        uint8 identifier;
        {
            uint24 fee;
            assembly {
                tokenIn := div(mload(add(add(data, 0x20), 0)), 0x1000000000000000000000000)
                fee := mload(add(add(data, 0x3), 20))
                identifier := mload(add(add(data, 0x1), 23))
                tradeId := mload(add(add(data, 0x1), 24))
                tokenOut := div(mload(add(add(data, 0x20), 25)), 0x1000000000000000000000000)
            }
        }
        assembly {
            identifier := mload(add(add(data, 0x1), 24)) // identifier for  tradeType
        }
        bool zeroForOne = tokenIn < tokenOut;
        address pool = pairAddress(tokenIn, tokenOut);
        {
            require(msg.sender == pool);
        }
        cache = data.length;
        if (tradeId == 1) {
            cache = data.length;
            uint256 referenceAmount = zeroForOne ? amount0 : amount1;
            referenceAmount = getAmountInDirect(pool, zeroForOne, referenceAmount);
            // either initiate the next swap or pay
            if (cache > 46) {
                data = skipToken(data);
                assembly {
                    tokenOut := div(mload(add(add(data, 0x20), 0)), 0x1000000000000000000000000)
                    tokenIn := div(mload(add(add(data, 0x20), 25)), 0x1000000000000000000000000)
                }
                // get next pool
                pool = pairAddress(tokenIn, tokenOut);
                // _transferERC20Tokens(tokenIn, pool, referenceAmount);
                zeroForOne = tokenIn > tokenOut;
                uint256 amountOut0;
                // amountOut0, cache
                (amountOut0, cache) = zeroForOne ? (referenceAmount, uint256(0)) : (uint256(0), referenceAmount);
                IUniswapV2Pair(pool).swap(amountOut0, cache, address(this), data);
                _transferERC20Tokens(tokenOut, msg.sender, referenceAmount);
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
            // (address token0, address token1) = sortTokens(tokenIn, tokenOut);
            // the swap amount is expected to be the nonzero output amount
            // since v2 does not send the input amount as argument, we have to fetch
            // the other amount manually through balanceOf
            (uint256 amountToSwap, uint256 amountToBorrow) = zeroForOne ? (amount1, cs().amount) : (amount0, cs().amount);
            if (cache > 46) {
                // we need to swap to the token that we want to supply
                // the router returns the amount that we can finally supply to the protocol
                data = skipToken(data);
                amountToSwap = exactInputToSelf(amountToSwap, data);
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
            uint256 referenceAmount = zeroForOne ? amount0 : amount1;
            // 4 is deposit
            if (tradeId == 4) {
                _mint(cTokenAddress(tokenIn), referenceAmount);
            } else {
                // 3 is repay
                _repayBorrow(cTokenAddress(tokenIn), referenceAmount);
            }
            // amount is now the amount to borrow/withdraw
            referenceAmount = getAmountInDirect(pool, zeroForOne, referenceAmount);
            if (cache > 46) {
                data = skipToken(data);
                assembly {
                    tokenOut := div(mload(add(add(data, 0x20), 0)), 0x1000000000000000000000000)
                    tokenIn := div(mload(add(add(data, 0x20), 25)), 0x1000000000000000000000000)
                }
                // get next pool
                pool = pairAddress(tokenIn, tokenOut);
                // _transferERC20Tokens(tokenIn, pool, referenceAmount);
                zeroForOne = tokenIn > tokenOut;
                uint256 amountOut0;
                // amountOut0, cache
                (amountOut0, cache) = zeroForOne ? (referenceAmount, uint256(0)) : (uint256(0), referenceAmount);
                IUniswapV2Pair(pool).swap(amountOut0, cache, address(this), data);
                _transferERC20Tokens(tokenOut, msg.sender, referenceAmount);
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

    // requires the initial amount to have already been sent to the first pair
    function exactInputToSelf(uint256 amountIn, bytes memory path) internal returns (uint256 amountOut) {
        address tokenIn;

        while (true) {
            address tokenOut;
            assembly {
                tokenIn := div(mload(add(add(path, 0x20), 0)), 0x1000000000000000000000000)
                tokenOut := div(mload(add(add(path, 0x20), 25)), 0x1000000000000000000000000)
            }
            address pair = pairAddress(tokenIn, tokenOut);
            bool hasMultiplePools = path.length > 46;
            bool zeroForOne = tokenIn < tokenOut;
            // send funds to pair
            _transferERC20Tokens(tokenIn, pair, amountIn);
            // calculate next amountIn
            amountIn = getAmountOutDirect(pair, zeroForOne, amountIn);
            (uint256 amount0Out, uint256 amount1Out) = zeroForOne ? (uint256(0), amountIn) : (amountIn, uint256(0));
            IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), new bytes(0));
            // decide whether to continue or terminate
            if (hasMultiplePools) {
                path = skipToken(path);
            } else {
                amountOut = amountIn;
                break;
            }
        }
    }

    // increase the margin position - borrow (tokenIn) and sell it against collateral (tokenOut)
    // the user provides the debt amount as input
    function openMarginPositionExactInV2(
        uint256 amountIn,
        uint256 amountOutMinimum,
        bytes memory path
    ) external returns (uint256 amountOut) {
        address tokenIn;
        address tokenOut;
        assembly {
            tokenIn := div(mload(add(path, 0x20)), 0x1000000000000000000000000)
            tokenOut := div(mload(add(add(path, 0x20), 25)), 0x1000000000000000000000000)
        }

        bool zeroForOne = tokenIn < tokenOut;
        cs().amount = amountIn;
        address pool = pairAddress(tokenIn, tokenOut);
        (uint256 amount0Out, uint256 amount1Out) = zeroForOne
            ? (uint256(0), getAmountOutDirect(pool, zeroForOne, amountIn))
            : (getAmountOutDirect(pool, zeroForOne, amountIn), uint256(0));
        IUniswapV2Pair(pool).swap(amount0Out, amount1Out, address(this), path);

        amountOut = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        if (amountOutMinimum > amountOut) revert Slippage();
    }

    // increase the margin position - borrow (tokenIn) and sell it against collateral (tokenOut)
    // the user provides the debt amount as input
    function openMarginPositionExactOutV2(
        uint256 amountOut,
        uint256 amountInMaximum,
        bytes memory path
    ) external returns (uint256 amountIn) {
        address tokenIn;
        address tokenOut;
        assembly {
            tokenOut := div(mload(add(path, 0x20)), 0x1000000000000000000000000)
            tokenIn := div(mload(add(add(path, 0x20), 25)), 0x1000000000000000000000000)
        }

        bool zeroForOne = tokenIn < tokenOut;
        cs().amount = amountIn;
        address pool = pairAddress(tokenIn, tokenOut);
        (uint256 amount0Out, uint256 amount1Out) = zeroForOne ? (uint256(0), amountOut) : (amountOut, uint256(0));
        IUniswapV2Pair(pool).swap(amount0Out, amount1Out, address(this), path);

        amountIn = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        if (amountInMaximum < amountIn) revert Slippage();
    }

    function cTokenAddress(address underlying) internal view virtual returns (address);

    function cTokenPair(address underlying, address underlyingOther) internal view virtual returns (address, address);
}

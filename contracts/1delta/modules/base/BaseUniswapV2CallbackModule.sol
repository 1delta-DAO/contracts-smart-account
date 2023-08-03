// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.21;

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

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(address tokenA, address tokenB) internal view returns (address pair) {
        (tokenA, tokenB) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            v2Factory,
                            keccak256(abi.encodePacked(tokenA, tokenB)),
                            hex"f2a343db983032be4e17d2d9d614e0dd9a305aed3083e6757c5bb8e2ab607abe" // init code hash
                        )
                    )
                )
            )
        );
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

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountOut) {
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    // given an output amount of an asset and pair reserves, returns a required input amount of the other asset
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = numerator / denominator + 1;
    }

    function getAmountInByPool(
        uint256 amountOut,
        IUniswapV2Pair pool,
        bool zeroForOne
    ) internal view returns (uint256 amountIn) {
        (uint256 reserveIn, uint256 reserveOut, ) = pool.getReserves();
        (reserveIn, reserveOut) = zeroForOne ? (reserveIn, reserveOut) : (reserveOut, reserveIn);
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = numerator / denominator + 1;
    }

    function getAmountOutDirect(
        address pair,
        bool zeroForOne,
        uint256 sellAmount
    ) internal view returns (uint256 buyAmount) {
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

    // path is encoded as addresses glued together

    function uniswapV2Call(
        address,
        uint256 amount0,
        uint256 amount1,
        bytes memory data
    ) external {
        uint8 tradeType;
        address tokenIn;
        address tokenOut;
        {
            uint24 fee;
            uint8 pId;
            assembly {
                tokenIn := div(mload(add(add(data, 0x20), 0)), 0x1000000000000000000000000)
                fee := mload(add(add(data, 0x3), 20))
                pId := mload(add(add(data, 0x1), 23))
                tradeType := mload(add(add(data, 0x1), 24))
                tokenOut := div(mload(add(add(data, 0x20), 25)), 0x1000000000000000000000000)
            }
        }
        bool zeroForOne = tokenIn < tokenOut;
        address pool = pairAddress(tokenIn, tokenOut);
        {
            require(msg.sender == pool);
        }

        if (tradeType == 4) {
            if (true) {
                (address token0, address token1) = sortTokens(tokenIn, tokenOut);
                // the swap amount is expected to be the nonzero output amount
                // since v2 does not send the input amount as argument, we have to fetch
                // the other amount manually through balanceOf
                (uint256 amountToSwap, uint256 amountToWithdraw) = amount0 > 0
                    ? (amount0, IERC20(token1).balanceOf(address(this)))
                    : (amount1, IERC20(token0).balanceOf(address(this)));

                if (data.length > 40) {
                    // we need to swap to the token that we want to supply
                    // the router returns the amount that we can finally supply to the protocol
                    data = skipToken(data);
                    amountToSwap = exactInputToSelf(amountToSwap, data);

                    // supply directly
                    tokenOut = getLastToken(data);
                    // cache amount
                    cs().amount = amountToSwap;
                }

                address cIn;
                (cIn, tokenOut) = cTokenPair(tokenIn, tokenOut);
                _mint(tokenOut, amountToSwap);

                // withraw and send funds to the pool
                _redeemUnderlying(cIn, amountToWithdraw);
                _transferERC20Tokens(tokenIn, msg.sender, amountToWithdraw);
            } else {
                uint256 amountToSupply = zeroForOne ? amount0 : amount1;
                uint256 amountInLastPool;
                IUniswapV2Pair pair = IUniswapV2Pair(pool);
                amountInLastPool = getAmountInByPool(amountToSupply, pair, zeroForOne);

                // we supply the amount received directly - together with user provided amount
                _mint(cTokenAddress(tokenIn), amountToSupply);
                // we then swap exact out where the first amount is
                // borrowed and paid from the money market
                // the received amount is paid back to the original pool
                if (data.length > 69) {
                    data = skipToken(data);
                    assembly {
                        tokenOut := div(mload(add(add(data, 0x20), 0)), 0x1000000000000000000000000)
                        tokenIn := div(mload(add(add(data, 0x20), 25)), 0x1000000000000000000000000)
                    }
                    (uint256 amount0Out, uint256 amount1Out) = zeroForOne ? (amountInLastPool, uint256(0)) : (uint256(0), amountInLastPool);
                    IUniswapV2Pair(pairAddress(tokenIn, tokenOut)).swap(amount0Out, amount1Out, msg.sender, data);
                } else {
                    // cache amount
                    cs().amount = amountInLastPool;
                    tokenIn = cTokenAddress(tokenOut);
                    _redeemUnderlying(tokenIn, amountInLastPool);
                    _transferERC20Tokens(tokenOut, msg.sender, amountInLastPool);
                }
            }
        }
        if (tradeType == 8) {
            if (true) {
                // (address token0, address token1) = sortTokens(tokenIn, tokenOut);
                // the swap amount is expected to be the nonzero output amount
                // since v2 does not send the input amount as argument, we have to fetch
                // the other amount manually through balanceOf
                (uint256 amountToSwap, uint256 amountToBorrow) = zeroForOne ? (amount1, cs().amount) : (amount0, cs().amount);
                if (data.length > 69) {
                    // we need to swap to the token that we want to supply
                    // the router returns the amount that we can finally supply to the protocol
                    data = skipToken(data);
                    amountToSwap = exactInputToSelf(amountToSwap, data);

                    // supply directly
                    tokenOut = getLastToken(data);
                }
                // cache amount
                cs().amount = amountToSwap;
                address cIn;
                (cIn, tokenOut) = cTokenPair(tokenIn, tokenOut);
                _mint(tokenOut, amountToSwap);
                // borrow and repay amount from the lending pool
                _borrow(cIn, amountToBorrow);
                _transferERC20Tokens(tokenIn, msg.sender, amountToBorrow);
            } else {
                uint256 amountToSupply = zeroForOne ? amount0 : amount1;
                uint256 amountInLastPool;
                IUniswapV2Pair pair = IUniswapV2Pair(pool);
                amountInLastPool = getAmountInByPool(amountToSupply, pair, zeroForOne);

                // we supply the amount received directly - together with user provided amount
                _mint(cTokenAddress(tokenIn), amountToSupply);
                // we then swap exact out where the first amount is
                // borrowed and paid from the money market
                // the received amount is paid back to the original pool
                if (data.length > 69) {
                    data = skipToken(data);
                    assembly {
                        tokenOut := div(mload(add(add(data, 0x20), 0)), 0x1000000000000000000000000)
                        tokenIn := div(mload(add(add(data, 0x20), 25)), 0x1000000000000000000000000)
                    }
                    (uint256 amount0Out, uint256 amount1Out) = zeroForOne ? (amountInLastPool, uint256(0)) : (uint256(0), amountInLastPool);
                    IUniswapV2Pair(pairAddress(tokenIn, tokenOut)).swap(amount0Out, amount1Out, msg.sender, data);
                } else {
                    // cache amount
                    cs().amount = amountInLastPool;
                    tokenIn = cTokenAddress(tokenOut);
                    _borrow(tokenIn, amountInLastPool);
                    _transferERC20Tokens(tokenOut, msg.sender, amountInLastPool);
                }
            }
        }
    }

    // requires the initial amount to have already been sent to the first pair
    // `refundETH` should be called at very end of all swaps
    function exactInputToSelf(uint256 amountIn, bytes memory path) internal returns (uint256 amountOut) {
        address tokenIn;
        address tokenOut;
        assembly {
            tokenIn := div(mload(add(add(path, 0x20), 0)), 0x1000000000000000000000000)
            tokenOut := div(mload(add(add(path, 0x20), 25)), 0x1000000000000000000000000)
        }
        address pair = pairAddress(tokenIn, tokenOut);
        _transferERC20Tokens(tokenIn, address(pair), amountIn);
        while (true) {
            bool hasMultiplePools = path.length > 69;
            (address token0, ) = sortTokens(tokenIn, tokenOut);
            // scope to avoid stack too deep errors
            {
                (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pair).getReserves();
                (uint256 reserveInput, uint256 reserveOutput) = tokenIn == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
                // calculate next amountIn
                amountIn = getAmountOut(amountIn, reserveInput, reserveOutput);
            }
            (uint256 amount0Out, uint256 amount1Out) = tokenIn == token0 ? (uint256(0), amountIn) : (amountIn, uint256(0));
            address to = hasMultiplePools ? pairAddress(tokenIn, tokenOut) : address(this);
            IUniswapV2Pair(pair).swap(amount0Out, amount1Out, to, new bytes(0));
            // decide whether to continue or terminate
            if (hasMultiplePools) {
                path = skipToken(path);
                // update pair
                pair = to;
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

    function cTokenAddress(address underlying) internal view virtual returns (address);

    function cTokenPair(address underlying, address underlyingOther) internal view virtual returns (address, address);
}

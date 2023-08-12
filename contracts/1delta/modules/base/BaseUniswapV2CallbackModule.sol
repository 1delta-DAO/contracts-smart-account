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
import {IUniswapV3Pool} from "../../dex-tools/uniswap/core/IUniswapV3Pool.sol";

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
        UNI_FF_FACTORY_ADDRESS = bytes32((uint256(0xff) << 248) | (uint256(uint160(_uniFactory)) << 88));
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

    function swapUniV2ExactIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) private returns (uint256 buyAmount) {
        address receiver = address(this);
        bytes32 ff_uni = FF_UNISWAP_FACTORY;
        assembly {
            let zeroForOne := lt(tokenIn, tokenOut)
            switch zeroForOne
            case 0 {
                mstore(0xB14, tokenIn)
                mstore(0xB00, tokenOut)
            }
            default {
                mstore(0xB14, tokenOut)
                mstore(0xB00, tokenIn)
            }
            let salt := keccak256(0xB0C, 0x28)
            mstore(0xB00, ff_uni)
            mstore(0xB15, salt)
            mstore(0xB35, CODE_HASH_UNI_V2)

            let pair := and(ADDRESS_MASK, keccak256(0xB00, 0x55))

            // EXECUTE TRANSFER
            let ptr := mload(0x40) // free memory pointer
            // selector for transfer(address,uint256)
            mstore(ptr, 0xa9059cbb00000000000000000000000000000000000000000000000000000000)
            mstore(add(ptr, 0x04), and(pair, ADDRESS_MASK))
            mstore(add(ptr, 0x24), amountIn)

            let success := call(gas(), and(tokenIn, ADDRESS_MASK), 0, ptr, 0x44, ptr, 32)

            let rdsize := returndatasize()

            // Check for ERC20 success. ERC20 tokens should return a boolean,
            // but some don't. We accept 0-length return data as success, or at
            // least 32 bytes that starts with a 32-byte boolean true.
            success := and(
                success, // call itself succeeded
                or(
                    iszero(rdsize), // no return data, or
                    and(
                        iszero(lt(rdsize, 32)), // at least 32 bytes
                        eq(mload(ptr), 1) // starts with uint256(1)
                    )
                )
            )

            if iszero(success) {
                returndatacopy(ptr, 0, rdsize)
                revert(ptr, rdsize)
            }
            // TRANSFER COMPLETE

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
                let sellAmountWithFee := mul(amountIn, 997)
                buyAmount := div(mul(sellAmountWithFee, buyReserve), add(sellAmountWithFee, mul(sellReserve, 1000)))

                // selector for swap(...)
                mstore(0xB00, 0x022c0d9f00000000000000000000000000000000000000000000000000000000)

                switch zeroForOne
                case 0 {
                    mstore(0xB04, buyAmount)
                    mstore(0xB24, 0)
                }
                default {
                    mstore(0xB04, 0)
                    mstore(0xB24, buyAmount)
                }
                mstore(0xB44, receiver)
                mstore(0xB64, 0x80)
                mstore(0xB84, 0)

                success := call(
                    gas(),
                    pair,
                    0x0,
                    0xB00, // input selector
                    0xA4, // input size = selector plus uint256
                    0, // output
                    0 // output size = 64
                )
                if iszero(success) {
                    // Forward the error
                    returndatacopy(0, 0, returndatasize())
                    revert(0, returndatasize())
                }
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
        while (true) {
            address tokenIn;
            address tokenOut;
            assembly {
                tokenIn := div(mload(add(add(path, 0x20), 0)), 0x1000000000000000000000000)
                tokenOut := div(mload(add(add(path, 0x20), 25)), 0x1000000000000000000000000)
            }

            // bool zeroForOne = tokenIn < tokenOut;
            // {
            //     // send funds to pair
            //     address pair = pairAddress(tokenIn, tokenOut);
            //     _transferERC20Tokens(tokenIn, pair, amountIn);
            //     // calculate next amountIn
            //     amountIn = getAmountOutDirect(pair, zeroForOne, amountIn);
            //     (uint256 amount0Out, uint256 amount1Out) = zeroForOne ? (uint256(0), amountIn) : (amountIn, uint256(0));
            //     IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), new bytes(0));
            // }
            amountIn = swapUniV2ExactIn(tokenIn, tokenOut, amountIn);
            // decide whether to continue or terminate
            if (path.length > 46) {
                path = skipToken(path);
            } else {
                amountOut = amountIn;
                break;
            }
        }
    }

    /// @dev Mask of lower 3 bytes.
    uint256 private constant UINT24_MASK = 0xffffff;
    /// @dev MIN_SQRT_RATIO + 1 from Uniswap's TickMath
    uint160 private immutable MIN_SQRT_RATIO = 4295128740;
    /// @dev MAX_SQRT_RATIO - 1 from Uniswap's TickMath
    uint160 private immutable MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970341;
    bytes32 private immutable UNI_FF_FACTORY_ADDRESS;
    bytes32 private immutable UNI_POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    /// @dev Returns the pool for the given token pair and fee. The pool contract may or may not exist.
    function getUniswapV3Pool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal view returns (address pool) {
        bytes32 ffFactoryAddress = UNI_FF_FACTORY_ADDRESS;
        bytes32 poolInitCodeHash = UNI_POOL_INIT_CODE_HASH;
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        assembly {
            let s := mload(0x40)
            let p := s
            mstore(p, ffFactoryAddress)
            p := add(p, 21)
            // Compute the inner hash in-place
            mstore(p, token0)
            mstore(add(p, 32), token1)
            mstore(add(p, 64), and(UINT24_MASK, fee))
            mstore(p, keccak256(p, 96))
            p := add(p, 32)
            mstore(p, poolInitCodeHash)
            pool := and(ADDRESS_MASK, keccak256(s, 85))
        }
    }

    function exactInputToSelfV3(uint256 amountIn, bytes memory _data) internal returns (uint256 amountOut) {
        while (true) {
            address tokenIn;
            address tokenOut;
            uint24 fee;
            uint8 pId;
            assembly {
                tokenIn := div(mload(add(add(_data, 0x20), 0)), 0x1000000000000000000000000)
                fee := mload(add(add(_data, 0x3), 20))
                pId := mload(add(add(_data, 0x1), 23))
                tokenOut := div(mload(add(add(_data, 0x20), 25)), 0x1000000000000000000000000)
            }

            bool zeroForOne = tokenIn < tokenOut;
            (int256 amount0, int256 amount1) = IUniswapV3Pool(getUniswapV3Pool(tokenIn, tokenOut, fee)).swap(
                address(this),
                zeroForOne,
                int256(amountIn),
                zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                sliceFirstPool(_data)
            );

            amountIn = uint256(-(zeroForOne ? amount1 : amount0));

            // decide whether to continue or terminate
            if (_data.length > 69) {
                _data = skipToken(_data);
            } else {
                amountOut = amountIn;
                break;
            }
        }
    }

    function sliceFirstPool(bytes memory _bytes) internal pure returns (bytes memory tempBytes) {
        assembly {
            // Get a location of some free memory and store it in tempBytes as
            // Solidity does for memory variables.
            tempBytes := mload(0x40)

            // The first word of the slice result is potentially a partial
            // word read from the original array. To read it, we calculate
            // the length of that partial word and start copying that many
            // bytes into the array. The first word we copy will start with
            // data we don't care about, but the last `lengthmod` bytes will
            // land at the beginning of the contents of the new array. When
            // we're done copying, we overwrite the full first word with
            // the actual length of the slice.
            let lengthmod := and(45, 31)

            // The multiplication in the next line is necessary
            // because when slicing multiples of 32 bytes (lengthmod == 0)
            // the following copy loop was copying the origin's length
            // and then ending prematurely not copying everything it should.
            let mc := add(add(tempBytes, lengthmod), mul(0x20, iszero(lengthmod)))
            let end := add(mc, 45)

            for {
                // The multiplication in the next line has the same exact purpose
                // as the one above.
                let cc := add(add(_bytes, lengthmod), mul(0x20, iszero(lengthmod)))
            } lt(mc, end) {
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
            } {
                mstore(mc, mload(cc))
            }

            mstore(tempBytes, 45)

            //update free-memory pointer
            //allocating the array padded to 32 bytes like the compiler does now
            mstore(0x40, and(add(mc, 31), not(31)))
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

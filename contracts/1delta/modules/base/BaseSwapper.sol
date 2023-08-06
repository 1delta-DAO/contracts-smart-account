// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.21;

/******************************************************************************\
* Author: Achthar | 1delta 
/******************************************************************************/

import {SafeCast} from "../../dex-tools/uniswap/core/SafeCast.sol";
import {IUniswapV3Pool} from "../../dex-tools/uniswap/core/IUniswapV3Pool.sol";
import {ISwapRouter} from "../../dex-tools/uniswap/interfaces/ISwapRouter.sol";
import {PeripheryValidation} from "../../dex-tools/uniswap/base/PeripheryValidation.sol";
import {PeripheryPaymentsWithFee} from "../../dex-tools/uniswap/base/PeripheryPaymentsWithFee.sol";
import {BytesLib} from "../../dex-tools/uniswap/libraries/BytesLib.sol";
import {PoolAddressCalculator} from "../../dex-tools/uniswap/libraries/PoolAddressCalculator.sol";
import {CallbackValidation} from "../../dex-tools/uniswap/libraries/CallbackValidation.sol";
import {TokenTransfer} from "../../libraries/TokenTransfer.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {TokenTransfer} from "../../libraries/TokenTransfer.sol";
import {BaseDecoder} from "./BaseDecoder.sol";

// solhint-disable max-line-length

/**
 * @title Uniswap Callback Base contract
 * @notice Contains main logic for uniswap callbacks
 */
abstract contract BaseSwapper is TokenTransfer, BaseDecoder {
    using BytesLib for bytes;
    using SafeCast for uint256;

    /// @dev Mask of lower 20 bytes.
    uint256 private constant ADDRESS_MASK = 0x00ffffffffffffffffffffffffffffffffffffffff;
    /// @dev Mask of lower 3 bytes.
    uint256 private constant UINT24_MASK = 0xffffff;

    /// @dev MIN_SQRT_RATIO + 1 from Uniswap's TickMath
    uint160 private immutable MIN_SQRT_RATIO = 4295128740;
    /// @dev MAX_SQRT_RATIO - 1 from Uniswap's TickMath
    uint160 private immutable MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970341;

    address private immutable uniswapV3Factory;

    bytes32 private immutable UNI_FF_FACTORY_ADDRESS;
    bytes32 private immutable UNI_POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    /// @dev Returns the pool for the given token pair and fee. The pool contract may or may not exist.
    function getUniswapV3Pool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) internal view returns (IUniswapV3Pool pool) {
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

    constructor(address _factory) {
        uniswapV3Factory = _factory;
        UNI_FF_FACTORY_ADDRESS = bytes32((uint256(0xff) << 248) | (uint256(uint160(_factory)) << 88));
    }

    function exactInputToSelf(uint256 amountIn, bytes memory _data) internal returns (uint256 amountOut) {
        while (true) {
            bytes memory swapData = getFirstPool(_data);
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
            (int256 amount0, int256 amount1) = getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
                address(this),
                zeroForOne,
                amountIn.toInt256(),
                zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
                swapData
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
}

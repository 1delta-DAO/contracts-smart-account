// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.21;

import {
    MarginCallbackData,
    ExactInputMultiParams,
    ExactOutputMultiParams,
    MarginSwapParamsMultiExactIn,
    MarginSwapParamsMultiExactOut
 } from "../dataTypes/InputTypes.sol";
import {IUniswapV3Pool} from "../../external-protocols/uniswapV3/core/interfaces/IUniswapV3Pool.sol";
import "../../external-protocols/uniswapV3/periphery/interfaces/ISwapRouter.sol";
import "../../external-protocols/uniswapV3/core/interfaces/callback/IUniswapV3SwapCallback.sol";
import {Path} from "../dex-tools/uniswap/libraries/Path.sol";
import "../dex-tools/uniswap/libraries/SafeCast.sol";
import {PoolAddressCalculator} from "../dex-tools/uniswap/libraries/PoolAddressCalculator.sol";
import {WithStorage, LibStorage} from "../libraries/LibStorage.sol";
import {BaseSwapper} from "./base/BaseSwapper.sol";

// solhint-disable max-line-length

/**
 * @title MarginTrader contract
 * @notice Allows users to build large margins positions with one contract interaction
 * @author Achthar
 */
contract MarginTraderModule is WithStorage, BaseSwapper {
    using Path for bytes;
    using SafeCast for uint256;

    uint256 private constant DEFAULT_AMOUNT_CACHED = type(uint256).max;

    address internal immutable v3Factory;

    /// @dev MIN_SQRT_RATIO + 1 from Uniswap's TickMath
    uint160 private immutable MIN_SQRT_RATIO = 4295128740;
    /// @dev MAX_SQRT_RATIO - 1 from Uniswap's TickMath
    uint160 private immutable MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970341;

    modifier onlyOwner() {
        LibStorage.enforceAccountOwner();
        _;
    }

    constructor(address _factory) BaseSwapper(_factory) {
        v3Factory = _factory;
    }

    function swapBorrowExactIn(ExactInputMultiParams memory params) external onlyOwner returns (uint256 amountOut) {
        (address tokenIn, address tokenOut, uint24 fee) = params.path.decodeFirstPool();

        MarginCallbackData memory data = MarginCallbackData({path: params.path, tradeType: 2, exactIn: true});

        bool zeroForOne = tokenIn < tokenOut;

        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            params.amountIn.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            abi.encode(data)
        );

        amountOut = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(params.amountOutMinimum <= amountOut, "Repaid too little");
    }

    // swaps the loan from one token (tokenIn) to another (tokenOut) provided tokenOut amount
    function swapBorrowExactOut(ExactOutputMultiParams memory params) external onlyOwner returns (uint256 amountIn) {
        (address tokenOut, address tokenIn, uint24 fee) = params.path.decodeFirstPool();

        MarginCallbackData memory data = MarginCallbackData({path: params.path, tradeType: 2, exactIn: false});

        bool zeroForOne = tokenIn < tokenOut;

        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            -params.amountOut.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            abi.encode(data)
        );

        amountIn = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(params.amountInMaximum >= amountIn, "Had to borrow too much");
    }

    // swaps the collateral from one token (tokenIn) to another (tokenOut) provided tokenOut amount
    function swapCollateralExactIn(ExactInputMultiParams memory params) external onlyOwner returns (uint256 amountOut) {
        (address tokenIn, address tokenOut, uint24 fee) = params.path.decodeFirstPool();
        MarginCallbackData memory data = MarginCallbackData({path: params.path, tradeType: 4, exactIn: true});

        bool zeroForOne = tokenIn < tokenOut;

        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            params.amountIn.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            abi.encode(data)
        );

        amountOut = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(params.amountOutMinimum <= amountOut, "Deposited too little");
    }

    // swaps the collateral from one token (tokenIn) to another (tokenOut) provided tokenOut amount
    function swapCollateralExactOut(ExactOutputMultiParams memory params) external onlyOwner returns (uint256 amountIn) {
        (address tokenOut, address tokenIn, uint24 fee) = params.path.decodeFirstPool();

        MarginCallbackData memory data = MarginCallbackData({path: params.path, tradeType: 4, exactIn: false});

        bool zeroForOne = tokenIn < tokenOut;

        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            -params.amountOut.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            abi.encode(data)
        );

        amountIn = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(params.amountInMaximum >= amountIn, "Had to withdraw too much");
    }

    // increase the margin position - borrow (tokenIn) and sell it against collateral (tokenOut)
    // the user provides the debt amount as input
    function openMarginPositionExactIn(
    uint256 amountIn,
    uint256 amountOutMinimum,
    bytes calldata path
    ) external onlyOwner returns (uint256 amountOut) {
        (address tokenIn, address tokenOut, uint24 fee) = decodeFirstPool(path);

        bool zeroForOne = tokenIn < tokenOut;
        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            amountIn.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            path
        );

        amountOut = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(amountOutMinimum <= amountOut, "Deposited too little");
    }

    // increase the margin position - borrow (tokenIn) and sell it against collateral (tokenOut)
    // the user provides the collateral amount as input
    function openMarginPositionExactOut(
    uint256 amountOut,
    uint256 amountInMaximum,
            bytes calldata path
    ) external onlyOwner returns (uint256 amountIn) {
        (address tokenOut, address tokenIn, uint24 fee) = decodeFirstPool(path);

        bool zeroForOne = tokenIn < tokenOut;
        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            -amountOut.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            path
        );

        amountIn = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(amountInMaximum >= amountIn, "Had to borrow too much");
    }

    // ================= Trimming Positions ==========================
    // decrease the margin position - use the collateral (tokenIn) to pay back a borrow (tokenOut)
    function trimMarginPositionExactIn(
            uint256 amountIn,
    uint256 amountOutMinimum,
            bytes calldata path

    ) external onlyOwner returns (uint256 amountOut) {
        (address tokenIn, address tokenOut, uint24 fee) = decodeFirstPool(path);


        bool zeroForOne = tokenIn < tokenOut;
        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            amountIn.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            path
        );

        amountOut = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(amountOutMinimum <= amountOut, "Repaid too little");
    }

    function trimMarginPositionExactOut(
                  uint256 amountOut,
    uint256 amountInMaximum,
            bytes calldata path
    ) external onlyOwner returns (uint256 amountIn) {
        (address tokenOut, address tokenIn, uint24 fee) = decodeFirstPool(path);

        bool zeroForOne = tokenIn < tokenOut;
        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            -amountOut.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            path
        );

        amountIn = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(amountInMaximum >= amountIn, "Had to withdraw too much");
    }
}

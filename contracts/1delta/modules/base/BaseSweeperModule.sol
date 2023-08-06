// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.21;

import {
    MarginCallbackData,
    AllInputMultiParamsBase,
    MinimalExactInputMultiParams,
    AllOutputMultiParamsBase,
    AllInputMultiParamsBaseWithRecipient
    } from "../../dataTypes/InputTypes.sol";
import {INativeWrapper} from "../../interfaces/INativeWrapper.sol";
import {IUniswapV3Pool} from "../../../external-protocols/uniswapV3/core/interfaces/IUniswapV3Pool.sol";
import {TokenTransfer} from "../../libraries/TokenTransfer.sol";
import {PoolAddressCalculator} from "../../dex-tools/uniswap/libraries/PoolAddressCalculator.sol";
import {CallbackData} from "../../dex-tools/uniswap/DataTypes.sol";
import {Path} from "../../dex-tools/uniswap/libraries/Path.sol";
import "../../dex-tools/uniswap/libraries/SafeCast.sol";
import "../../../external-protocols/uniswapV3/periphery/interfaces/ISwapRouter.sol";
import "../../../external-protocols/uniswapV3/core/interfaces/callback/IUniswapV3SwapCallback.sol";
import {WithStorage, LibStorage} from "../../libraries/LibStorage.sol";
import "../../interfaces/IDataProvider.sol";
import "../../../periphery-standalone/interfaces/IMinimalSwapRouter.sol";
import {UniswapDataHolder} from "../utils/UniswapDataHolder.sol";
import "./BaseLendingHandler.sol";
import {BaseSwapper} from "./BaseSwapper.sol";

// solhint-disable max-line-length

/**
 * @title Sweeper module
 * @notice Contract to handle sewwping transactions, i.e. transaction with the objective to prevent dust
 * This cannot always work in swap scenarios with withdrawals, however, for repaying debt, the methods are consistent.
 * @author Achthar
 */
abstract contract BaseSweeperModule is WithStorage, BaseLendingHandler, UniswapDataHolder, TokenTransfer, BaseSwapper {
    using Path for bytes;
    using SafeCast for uint256;

    uint256 private constant DEFAULT_AMOUNT_CACHED = type(uint256).max;
    address private constant DEFAULT_ADDRESS_CACHED = address(0);

    /// @dev MIN_SQRT_RATIO + 1 from Uniswap's TickMath
    uint160 private immutable MIN_SQRT_RATIO = 4295128740;
    /// @dev MAX_SQRT_RATIO - 1 from Uniswap's TickMath
    uint160 private immutable MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970341;

    modifier onlyOwner() {
        LibStorage.enforceAccountOwner();
        _;
    }

    constructor(
        address _factory,
        address _nativeWrapper,
        address _router
    ) BaseLendingHandler(_nativeWrapper) UniswapDataHolder(_factory, _router) BaseSwapper(_factory) {}

    // money market functions

    // wraps ether if underlying is weth, returns amount withdrawn
    function redeemAll(address _underlying, address _recipient) external onlyOwner returns (uint256) {
        return redeemAllCToken(_underlying, _recipient);
    }

    function redeemAllEther(address payable _recipient) external onlyOwner returns (uint256 balanceWithdrawn) {
        cEther().redeem(cEther().balanceOf(address(this)));
        balanceWithdrawn = address(this).balance;
        _recipient.transfer(balanceWithdrawn);
    }

    // same result as redeemAll with underlying = weth
    function redeemAllEtherAndWrap(address _recipient) external onlyOwner returns (uint256 balanceWithdrawn) {
        cEther().redeem(cEther().balanceOf(address(this)));
        balanceWithdrawn = address(this).balance;
        INativeWrapper _weth = INativeWrapper(nativeWrapper);
        _weth.deposit{value: balanceWithdrawn}();
        _weth.transfer(_recipient, balanceWithdrawn);
    }

    function repayBorrowAll(address _underlying) external onlyOwner {
        uint256 _repayAmount = borrowBalanceCurrent(_underlying);
        _transferERC20TokensFrom(_underlying, msg.sender, address(this), _repayAmount);
        repayPrivate(_underlying, _repayAmount);
    }

    function repayBorrowAllEther() external payable onlyOwner {
        uint256 _repayAmount = borrowBalanceCurrent(nativeWrapper);
        uint256 dust = msg.value - _repayAmount;
        cEther().repayBorrow{value: _repayAmount}();
        payable(msg.sender).transfer(dust);
    }

    function unwrapAndRepayBorrowAllEther() external onlyOwner {
        uint256 _repayAmount = borrowBalanceCurrent(nativeWrapper);
        INativeWrapper _weth = INativeWrapper(nativeWrapper);
        _weth.transferFrom(msg.sender, address(this), _repayAmount);
        _weth.withdraw(_repayAmount);
        cEther().repayBorrow{value: _repayAmount}();
    }

    // money market swap functions

    function withdrawAndSwapAllIn(AllInputMultiParamsBaseWithRecipient calldata params) external onlyOwner returns (uint256 amountOut) {
        address tokenIn = params.path.getFirstToken();

        // approve router
        _approve(tokenIn, router, type(uint256).max);
        // set amount in for Uniswap
        amountOut = IMinimalSwapRouter(router).exactInput(
            ExactInputParams({path: params.path, amountIn: redeemAllCTokenAndKeep(tokenIn), recipient: params.recipient})
        );

        require(amountOut >= params.amountOutMinimum, "Received too little");
    }

    function withdrawAndSwapAllInToETH(AllInputMultiParamsBaseWithRecipient calldata params) external onlyOwner returns (uint256 amountOut) {
        address tokenIn = params.path.getFirstToken();
        // approve router
        _approve(tokenIn, router, type(uint256).max);
        // set amount in for Uniswap
        amountOut = IMinimalSwapRouter(router).exactInputToSelf(
            MinimalExactInputMultiParams({path: params.path, amountIn: redeemAllCTokenAndKeep(tokenIn)})
        );
        INativeWrapper(nativeWrapper).withdraw(amountOut);
        payable(params.recipient).transfer(amountOut);
        require(amountOut >= params.amountOutMinimum, "Received too little");
    }

    function swapAndRepayAllOut(AllOutputMultiParamsBase calldata params) external onlyOwner returns (uint256 amountIn) {
        (address tokenOut, address tokenIn, uint24 fee) = params.path.decodeFirstPool();
        MarginCallbackData memory data = MarginCallbackData({path: params.path, tradeType: 12, exactIn: false});
        cs().cachedAddress = msg.sender;
        uint256 amountOut = borrowBalanceCurrent(tokenOut);
        bool zeroForOne = tokenIn < tokenOut;
        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            -amountOut.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            abi.encode(data)
        );

        amountIn = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        cs().cachedAddress = DEFAULT_ADDRESS_CACHED;
        require(params.amountInMaximum >= amountIn, "Had to pay too much");

        // deposit received amount to the lending protocol on behalf of user
        repayPrivate(tokenOut, amountOut);
    }

    // amountOut will be ignored and replaced with the target maximum repay amount
    function swapETHAndRepayAllOut(ExactOutputMultiParams calldata params) external payable onlyOwner returns (uint256 amountIn) {
        INativeWrapper _weth = INativeWrapper(nativeWrapper);
        _weth.deposit{value: msg.value}();
        _weth.approve(router, type(uint256).max);
        uint256 amountOut = borrowBalanceCurrent(params.path.getFirstToken());
        // use the swap router to swap exact out
        amountIn = IMinimalSwapRouter(router).exactOutputToSelf(MinimalExactOutputMultiParams({path: params.path, amountOut: amountOut}));
        require(amountIn <= params.amountInMaximum, "had to pay too much");

        // deposit received amount to the lending protocol on behalf of user
        repayPrivate(params.path.getFirstToken(), amountOut);
        // refund dust
        uint256 dust = msg.value - amountIn;
        _weth.withdraw(dust);
        payable(msg.sender).transfer(dust);
    }

    // margin trader functions

    // swaps the loan from one token (tokenIn) to another (tokenOut) provided tokenOut amount
    function swapBorrowAllOut(uint256 amountInMaximum, bytes calldata path) external onlyOwner returns (uint256 amountIn) {
        (address tokenOut, address tokenIn, uint24 fee) = decodeFirstPool(path);

        bool zeroForOne = tokenIn < tokenOut;

        uint256 amountOut = borrowBalanceCurrent(tokenOut);
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

    // swaps the collateral from one token (tokenIn) to another (tokenOut) provided tokenOut amount
    function swapCollateralAllIn(uint256 amountOutMinimum, bytes calldata path) external onlyOwner returns (uint256 amountOut) {
        (address tokenIn, address tokenOut, uint24 fee) = decodeFirstPool(path);

        bool zeroForOne = tokenIn < tokenOut;

        uint256 amountIn = balanceOfUnderlying(path.getFirstToken());
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

    // ================= Trimming Positions ==========================

    // decrease the margin position - use the collateral (tokenIn) to pay back a borrow (tokenOut)
    function trimMarginPositionAllIn(uint256 amountOutMinimum, bytes calldata path) external onlyOwner returns (uint256 amountOut) {
        (address tokenIn, address tokenOut, uint24 fee) = decodeFirstPool(path);

        bool zeroForOne = tokenIn < tokenOut;

        uint256 amountIn = balanceOfUnderlying(tokenIn);
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

    function trimMarginPositionAllOut(uint256 amountInMaximum, bytes memory path) external onlyOwner returns (uint256 amountIn) {
        (address tokenOut, address tokenIn, uint24 fee) = decodeFirstPool(path);
        bool zeroForOne = tokenIn < tokenOut;

        uint256 amountOut = borrowBalanceCurrent(tokenOut);
        getUniswapV3Pool(tokenIn, tokenOut, fee).swap(
            address(this),
            zeroForOne,
            -amountOut.toInt256(),
            zeroForOne ? MIN_SQRT_RATIO : MAX_SQRT_RATIO,
            path
        );

        amountIn = cs().amount;
        cs().amount = DEFAULT_AMOUNT_CACHED;
        require(amountInMaximum >= amountIn, "Had to pay too much");
    }
}

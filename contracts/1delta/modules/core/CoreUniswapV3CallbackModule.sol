// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.20;

/******************************************************************************\
* Author: Achthar
/******************************************************************************/

import "../base/BaseUniswapV3CallbackModule.sol";
import {LendingHandler} from "./LendingHandler.sol";

// solhint-disable max-line-length

/**
 * @title Uniswap Callback Core contract
 * @notice Adds specific lending pool interactions based on getters to the contract
 */
abstract contract CoreUniswapV3CallbackModule is BaseUniswapV3CallbackModule, LendingHandler {
    constructor(
        address _factory,
        address _weth,
        address _router
    ) BaseUniswapV3CallbackModule(_factory, _weth, _router) LendingHandler(_weth) {}

    function pay(
        address token,
        address payer,
        uint256 value
    ) internal override(LendingHandler, BaseLendingHandler) {
        super.pay(token, payer, value);
    }

    function mintPrivate(address token, uint256 valueToDeposit) internal override(LendingHandler, BaseLendingHandler) {
        super.mintPrivate(token, valueToDeposit);
    }

    function redeemPrivate(
        address token,
        uint256 valueToWithdraw,
        address recipient
    ) internal override(LendingHandler, BaseLendingHandler) {
        super.redeemPrivate(token, valueToWithdraw, recipient);
    }

    function redeemAllCToken(address token, address recipient) internal override(LendingHandler, BaseLendingHandler) returns (uint256) {
        return super.redeemAllCToken(token, recipient);
    }

    function redeemAllCTokenAndKeep(address token) internal override(LendingHandler, BaseLendingHandler) returns (uint256) {
        return super.redeemAllCTokenAndKeep(token);
    }

    function redeemCTokenPrivate(
        address token,
        uint256 cTokenAmountToRedeem,
        address recipient
    ) internal override(LendingHandler, BaseLendingHandler) returns (uint256) {
        return super.redeemCTokenPrivate(token, cTokenAmountToRedeem, recipient);
    }

    function borrowPrivate(
        address token,
        uint256 valueToBorrow,
        address recipient
    ) internal override(LendingHandler, BaseLendingHandler) {
        super.borrowPrivate(token, valueToBorrow, recipient);
    }

    function repayPrivate(address token, uint256 valueToRepay) internal override(LendingHandler, BaseLendingHandler) {
        return super.repayPrivate(token, valueToRepay);
    }

    function cToken(address _underlying) internal view virtual override(BaseLendingHandler, LendingHandler) returns (ICompoundTypeCERC20);

    function cEther() internal view virtual override(BaseLendingHandler, LendingHandler) returns (ICompoundTypeCEther);
}

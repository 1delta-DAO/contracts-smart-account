// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.20;

/******************************************************************************\
* Author: Achthar
/******************************************************************************/

import "./base/BaseUniswapV3CallbackModule.sol";
import {TransferHelper} from "../dex-tools/uniswap/libraries/TransferHelper.sol";
import {IDataProvider} from "../interfaces/IDataProvider.sol";
import {INativeWrapper} from "../interfaces/INativeWrapper.sol";

// solhint-disable max-line-length

/// @title Module for Uniswap callbacks
contract UniswapCallbackModule is BaseUniswapV3CallbackModule {
    using Path for bytes;
    using SafeCast for uint256;

    constructor(
        address _factory,
        address _nativeWrapper,
        address _router
    ) BaseUniswapV3CallbackModule(_factory, _nativeWrapper, _router) {}

    /// @param token The token to pay
    /// @param payer The entity that must pay
    /// @param value The amount to pay
    function pay(
        address token,
        address payer,
        uint256 value
    ) internal override {
        address _nativeWrapper = nativeWrapper;
        if (token == _nativeWrapper && address(this).balance >= value) {
            // pay with nativeWrapper
            INativeWrapper(_nativeWrapper).deposit{value: value}(); // wrap only what is needed to pay
            INativeWrapper(_nativeWrapper).transfer(msg.sender, value);
        } else if (payer == address(this)) {
            // pay with tokens already in the contract (for the exact input multihop case)
            TransferHelper.safeTransfer(token, msg.sender, value);
        } else {
            // pull payment
            TransferHelper.safeTransferFrom(token, payer, msg.sender, value);
        }
    }

    /// @notice the Compound protocol uses cETH for ETH deposits
    /// as Uniswap uses only WETH in their interactions, we have to withdraw the ETH from
    /// the WETH contract to then deposit (mint cETH) on Compound
    /// @param token The token to pay
    /// @param valueToDeposit The amount to pay
    function mintPrivate(address token, uint256 valueToDeposit) internal override {
        address _nativeWrapper = nativeWrapper;
        if (token == _nativeWrapper) {
            // withdraw WETH
            INativeWrapper(_nativeWrapper).withdraw(valueToDeposit); // unwrap
            // deposit ETH
            cEther().mint{value: valueToDeposit}();
        } else {
            // deposit regular ERC20
            cToken(token).mint(valueToDeposit);
        }
    }

    /// @notice the Compound protocol uses cETH for ETH deposits
    /// as Uniswap uses only WETH in their interactions, we have to withdraw the ETH from
    /// the WETH contract to then deposit (mint cETH) on Compound
    /// @param token The token to pay
    /// @param valueToWithdraw The amount to pay
    function redeemPrivate(
        address token,
        uint256 valueToWithdraw,
        address recipient
    ) internal override {
        address _nativeWrapper = nativeWrapper;
        if (token == _nativeWrapper) {
            // withdraw ETH from cETH
            cEther().redeemUnderlying(valueToWithdraw);
            // withdraw WETH
            INativeWrapper(_nativeWrapper).deposit{value: valueToWithdraw}(); // unwrap
            // transfer WETH
            TransferHelper.safeTransfer(_nativeWrapper, recipient, valueToWithdraw);
        } else {
            // deposit regular ERC20
            cToken(token).redeemUnderlying(valueToWithdraw);
            // repay ERC20
            TransferHelper.safeTransfer(token, recipient, valueToWithdraw);
        }
    }

    /// @notice the Compound protocol uses cETH for ETH deposits
    /// as Uniswap uses only WETH in their interactions, we have to withdraw the ETH from
    /// the WETH contract to then deposit (mint cETH) on Compound
    /// @param token The token to pay
    /// @param valueToWithdraw The amount to pay
    function redeemCTokenPrivate(
        address token,
        uint256 valueToWithdraw,
        address recipient
    ) internal override returns (uint256 underlyingAmount) {
        address _nativeWrapper = nativeWrapper;
        if (token == _nativeWrapper) {
            // withdraw ETH from cETH
            cEther().redeem(valueToWithdraw);
            // record balance
            underlyingAmount = address(this).balance;
            // withdraw WETH
            INativeWrapper(_nativeWrapper).deposit{value: underlyingAmount}(); // unwrap
            // transfer WETH
            TransferHelper.safeTransfer(_nativeWrapper, recipient, underlyingAmount);
        } else {
            // deposit regular ERC20
            cToken(token).redeemUnderlying(underlyingAmount);
            // record balance
            underlyingAmount = IERC20(token).balanceOf(address(this));
            // repay ERC20
            TransferHelper.safeTransfer(token, recipient, underlyingAmount);
        }
    }

    /// @param token The token to redeem
    /// @notice redeems full balance of cToken and returns the amount of underlying withdrawn
    function redeemAllCToken(address token, address recipient) internal override returns (uint256 underlyingAmount) {
        address _nativeWrapper = nativeWrapper;
        if (token == _nativeWrapper) {
            // withdraw ETH from cETH
            cEther().redeem(cEther().balanceOf(address(this)));
            // record balance of this account
            underlyingAmount = address(this).balance;
            // withdraw WETH
            INativeWrapper(_nativeWrapper).deposit{value: underlyingAmount}(); // unwrap
            // transfer WETH
            TransferHelper.safeTransfer(_nativeWrapper, recipient, underlyingAmount);
        } else {
            // deposit regular ERC20
            cToken(token).redeem(cToken(token).balanceOf((address(this))));
            // record balance of this account
            underlyingAmount = IERC20(token).balanceOf(address(this));
            // repay ERC20
            TransferHelper.safeTransfer(token, recipient, underlyingAmount);
        }
    }

    /// @param token The token to redeem
    /// @notice redeems full balance of cToken and returns the amount of underlying withdrawn
    function redeemAllCTokenAndKeep(address token) internal override returns (uint256 underlyingAmount) {
        address _nativeWrapper = nativeWrapper;
        if (token == _nativeWrapper) {
            // withdraw ETH from cETH
            cEther().redeem(cEther().balanceOf(address(this)));
            // record balance of this account
            underlyingAmount = address(this).balance;
            // withdraw WETH
            INativeWrapper(_nativeWrapper).deposit{value: underlyingAmount}(); // unwrap
        } else {
            // deposit regular ERC20
            cToken(token).redeem(cToken(token).balanceOf((address(this))));
            // record balance of this account
            underlyingAmount = IERC20(token).balanceOf(address(this));
        }
    }

    /// @notice the Compound protocol uses cETH for ETH deposits
    /// as Uniswap uses only WETH in their interactions, we have to withdraw the ETH from
    /// the WETH contract to then deposit (mint cETH) on Compound
    /// @param token The token to pay
    /// @param valueToBorrow The amount to borrow
    function borrowPrivate(
        address token,
        uint256 valueToBorrow,
        address recipient
    ) internal override {
        address _nativeWrapper = nativeWrapper;
        if (token == _nativeWrapper) {
            // borrow ETH
            cEther().borrow(valueToBorrow);
            // deposit ETH for wETH
            INativeWrapper(_nativeWrapper).deposit{value: valueToBorrow}();
            // transfer WETH
            TransferHelper.safeTransfer(_nativeWrapper, recipient, valueToBorrow);
        } else {
            // borrow regular ERC20
            cToken(token).borrow(valueToBorrow);
            // transfer ERC20
            TransferHelper.safeTransfer(token, recipient, valueToBorrow);
        }
    }

    /// @notice the Compound protocol uses cETH for ETH deposits
    /// as Uniswap uses only WETH in their interactions, we have to withdraw the ETH from
    /// the WETH contract to then deposit (mint cETH) on Compound
    /// @param token The token to pay
    /// @param valueToRepay The amount to repay
    function repayPrivate(address token, uint256 valueToRepay) internal override {
        address _nativeWrapper = nativeWrapper;
        if (token == _nativeWrapper) {
            // withdraw WETH
            INativeWrapper(_nativeWrapper).withdraw(valueToRepay); // unwrap
            // repay ETH
            cEther().repayBorrow{value: valueToRepay}();
        } else {
            // repay  regular ERC20
            cToken(token).repayBorrow(valueToRepay);
        }
    }

    function cToken(address underlying) internal view override returns (ICompoundTypeCERC20) {
        return IDataProvider(ps().dataProvider).cToken(underlying);
    }

    function cEther() internal view override returns (ICompoundTypeCEther) {
        return IDataProvider(ps().dataProvider).cEther();
    }

    function getComptroller() internal view override returns (IComptroller) {
        return IDataProvider(ps().dataProvider).getComptroller();
    }
}

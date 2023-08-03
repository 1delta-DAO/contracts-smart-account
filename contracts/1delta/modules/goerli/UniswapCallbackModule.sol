// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.21;

/******************************************************************************\
* Author: Achthar
/******************************************************************************/

import "../core/CoreUniswapV3CallbackModule.sol";
import {GoerliCompoundCTokenData, IComptroller} from "./GoerliCompoundCTokenData.sol";
import {ICompoundTypeCERC20} from "../../interfaces/compound/ICompoundTypeCERC20.sol";
import {ICompoundTypeCEther} from "../../interfaces/compound/ICompoundTypeCEther.sol";

// solhint-disable max-line-length

/// @title Module for Uniswap callbacks
contract UniswapCallbackModuleGoerli is GoerliCompoundCTokenData, CoreUniswapV3CallbackModule {
    constructor(
        address _factory,
        address _weth,
        address _router
    ) CoreUniswapV3CallbackModule(_factory, _weth, _router) GoerliCompoundCTokenData() {}

    function cToken(address underlying) internal view override returns (ICompoundTypeCERC20) {
        return _cToken(underlying);
    }

    function cEther() internal view override returns (ICompoundTypeCEther) {
        return _cEther();
    }

    function getComptroller() internal view returns (IComptroller) {
        return _getComptroller();
    }

    function cTokenPair(address underlying, address underlyingOther) internal view override returns (address, address) {}

    function cTokenAddress(address underlying) internal view override returns (address) {}
}

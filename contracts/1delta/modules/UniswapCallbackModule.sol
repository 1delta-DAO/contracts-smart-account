// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.21;

/******************************************************************************\
* Author: Achthar
/******************************************************************************/

import {BaseUniswapV3CallbackModule} from "./base/BaseUniswapV3CallbackModule.sol";
import {IDataProvider} from "../interfaces/IDataProvider.sol";

// solhint-disable max-line-length

/// @title Module for Uniswap callbacks
contract UniswapCallbackModule is BaseUniswapV3CallbackModule {
    constructor(
        address _factory,
        address _nativeWrapper,
        address _cNative
    ) BaseUniswapV3CallbackModule(_factory, _nativeWrapper, _cNative) {}

    function cTokenPair(address underlying, address underlyingOther) internal view override returns (address, address) {
        return IDataProvider(ps().dataProvider).cTokenPair(underlying, underlyingOther);
    }

    function cTokenAddress(address underlying) internal view override returns (address) {
        return IDataProvider(ps().dataProvider).cTokenAddress(underlying);
    }
}

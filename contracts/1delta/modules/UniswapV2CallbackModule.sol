// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.21;

/******************************************************************************\
* Author: Achthar
/******************************************************************************/

import {BaseUniswapV2CallbackModule} from "./base/BaseUniswapV2CallbackModule.sol";
import {IDataProvider} from "../interfaces/IDataProvider.sol";

// solhint-disable max-line-length

/// @title Module for Uniswap callbacks
contract UniswapV2CallbackModule is BaseUniswapV2CallbackModule {
    constructor(
        address _factoryV2,
        address _factoryV3,
        address _nativeWrapper,
        address _cNative
    ) BaseUniswapV2CallbackModule(_factoryV2, _factoryV3, _nativeWrapper, _cNative) {}

    function cTokenPair(address underlying, address underlyingOther) internal view override returns (address, address) {
        return IDataProvider(ps().dataProvider).cTokenPair(underlying, underlyingOther);
    }

    function cTokenAddress(address underlying) internal view override returns (address) {
        return IDataProvider(ps().dataProvider).cTokenAddress(underlying);
    }
}

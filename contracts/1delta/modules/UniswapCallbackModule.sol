// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.21;

/******************************************************************************\
* Author: Achthar
/******************************************************************************/

import "./base/BaseUniswapV3CallbackModule.sol";
import {IDataProvider} from "../interfaces/IDataProvider.sol";
import {INativeWrapper} from "../interfaces/INativeWrapper.sol";
import {TokenTransfer} from "../libraries/TokenTransfer.sol";

// solhint-disable max-line-length

/// @title Module for Uniswap callbacks
contract UniswapCallbackModule is BaseUniswapV3CallbackModule {
    using Path for bytes;
    using SafeCast for uint256;

    constructor(
        address _factory,
        address _nativeWrapper,
        address _router,
        address _cNative
    ) BaseUniswapV3CallbackModule(_factory, _nativeWrapper, _cNative) {}

    function cTokenPair(address underlying, address underlyingOther) internal view override returns (address, address) {
        return IDataProvider(ps().dataProvider).cTokenPair(underlying, underlyingOther);
    }

    function cTokenAddress(address underlying) internal view override returns (address) {
        return IDataProvider(ps().dataProvider).cTokenAddress(underlying);
    }
}

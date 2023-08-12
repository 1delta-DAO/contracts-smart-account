// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.21;

import "../core/CoreSweeperModule.sol";
import {GoerliCompoundCTokenData, IComptroller} from "./GoerliCompoundCTokenData.sol";

// solhint-disable max-line-length

/**
 * @title MoneyMarketOperator contract
 * @notice Allows interaction of account contract with cTokens as defined by the Compound protocol
 * @author Achthar
 */
contract SweeperModuleGoerli is CoreSweeperModule, GoerliCompoundCTokenData {
    constructor(
        address _factory,
        address _nativeWrapper,
        address _router
    ) CoreSweeperModule(address(0), _factory, _nativeWrapper, _router) GoerliCompoundCTokenData() {}

    function cToken(address underlying) internal view override returns (ICompoundTypeCERC20) {
        return _cToken(underlying);
    }

    function cEther() internal view override returns (ICompoundTypeCEther) {
        return _cEther();
    }

    function getComptroller() internal view override returns (IComptroller) {
        return _getComptroller();
    }

    function cTokenPair(address underlying, address underlyingOther) internal view override returns (address, address) {}

    function cTokenAddress(address underlying) internal view override returns (address) {}
}

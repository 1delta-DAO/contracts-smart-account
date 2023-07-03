// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.20;

import "../core/CoreSweeperModule.sol";
import {OTokenData, IComptroller} from "./OTokenData.sol";

// solhint-disable max-line-length

/**
 * @title MoneyMarketOperator contract
 * @notice Allows interaction of account contract with cTokens as defined by the Compound protocol
 * @author Achthar
 */
contract SweeperModulePolygon is CoreSweeperModule, OTokenData {
    constructor(
        address _factory,
        address _nativeWrapper,
        address _router
    ) CoreSweeperModule(_factory, _nativeWrapper, _router) OTokenData() {}

    function cToken(address underlying) internal view override returns (ICompoundTypeCERC20) {
        return _cToken(underlying);
    }

    function cEther() internal view override returns (ICompoundTypeCEther) {
        return _cEther();
    }

    function getComptroller() internal view override returns (IComptroller) {
        return _getComptroller();
    }
}

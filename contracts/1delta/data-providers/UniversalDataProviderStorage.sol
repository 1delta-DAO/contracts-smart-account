// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;

import "../../libraries/structs/EnumerableSet.sol";

contract UniversaDataProviderBaseStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;
}

contract DataProviderStorageGenesis is UniversaDataProviderBaseStorage {
    // ether collateral tokens
    mapping(uint => address) internal _cEthers;

    // maps lender to underlying to collateral tokens
    mapping(uint => mapping(address => address)) internal _collateralTokens;

    // maps lender to underlying to debt tokens
    mapping(uint => mapping(address => address)) internal _debtTokens;

    // maps lender to underlying to stable debt tokens (aave style)
    mapping(uint => mapping(address => address)) internal _stableDebtTokens;

    // for compounds this is the comptroller / comet, for Aaves it is the lending pool
    mapping(uint => address) internal _lendingCore;
}

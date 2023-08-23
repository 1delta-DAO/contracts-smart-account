// SPDX-License-Identifier: MIT

pragma solidity ^0.8.21;

import "../libraries/structs/EnumerableSet.sol";

contract AccountFactoryBaseStorage {
    /**
     * @notice Administrator for this contract
     */
    address public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address public pendingAdmin;

    /**
     * @notice Active logic of AccountFactory
     */
    address public implementation;

    /**
     * @notice Pending logic of AccountFactory
     */
    address public pendingImplementation;
}

contract AccountFactoryStorageGenesis is AccountFactoryBaseStorage {
    bool public initialized;

    // address that provides the logic for each account proxy deployed from this contract
    address public moduleProvider;

    // address that provides the data regards to protocols and pools to the account
    address public dataProvider;

    // maps user address to account set
    mapping(address => EnumerableSet.AddressSet) internal accounts;

    // maps account address to user who created the account
    mapping(address => address) public accountOwners;

    // all accounts created as an array
    address[] public allAccounts;

    // flags foor validity of an account
    mapping(address => bool) public isAccount;

    mapping(address => uint256) public nonces;
}

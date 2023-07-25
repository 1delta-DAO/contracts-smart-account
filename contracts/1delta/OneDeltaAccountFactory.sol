// SPDX-License-Identifier: MIT

pragma solidity ^0.8.21;

/******************************************************************************\
* Author: Achthar - 1delta.io
* A factory contract that deploys 1Delta Margin Accounts.
* Designed to be the logic for a proxy contract.
/******************************************************************************/

import {OneDeltaAccount} from "./OneDeltaAccount.sol";
import {IAccountInit} from "./interfaces/IAccountInit.sol";
import {IAccountSetUp} from "./interfaces/IAccountSetUp.sol";
import {IProxy} from "./interfaces/IProxy.sol";
import {IDataProvider} from "./interfaces/IDataProvider.sol";
import {AccountMetadata, IAccountMeta} from "./interfaces/IAccountMeta.sol";
import {EnumerableSet, AccountFactoryStorageGenesis} from "./AccountFactoryStorage.sol";

// solhint-disable max-line-length

contract OneDeltaAccountFactory is AccountFactoryStorageGenesis {
    using EnumerableSet for EnumerableSet.AddressSet;
    event AccountCreated(address indexed owner, uint256 accountId);
    
    /**
     * @notice Sets this contract as the implementation for a proxy input
     * @param proxy the proxy contract to accept this implementation
     */
    function _become(IProxy proxy) external {
        require(msg.sender == proxy.admin(), "only proxy admin can change brains");
        proxy._acceptImplementation();
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Factory: Only admin can interact");
        _;
    }

    function initialize(address _moduleProvider, address _dataProvider) external onlyAdmin {
        require(!initialized, "Factory: Already initialized");
        moduleProvider = _moduleProvider;
        dataProvider = _dataProvider;
        initialized = true;
    }

    function allAccountsLength() external view returns (uint256) {
        return allAccounts.length;
    }

    /**
     * @notice Creates a new account for the sender
     * @param _accountName account name
     * @param _enterAndSetUp if true, the account enters automatically all markets and approves all underlyings
     */
    function createAccount(string memory _accountName, bool _enterAndSetUp) external returns (address account) {
        address owner = msg.sender; // save gas
        require(owner != address(0), "MarginAccount: CANNOT_BE_OWNED_BY_ZERO");

        uint256 accountId = allAccounts.length;
        // create salt for create2
        bytes32 _salt = keccak256(abi.encodePacked(owner, accountId));

        // deploy contract
        account = address(new OneDeltaAccount{salt: _salt}(moduleProvider));

        // initialize data provider
        IAccountInit(account).init(dataProvider, owner, _accountName, _enterAndSetUp);

        // add account to records
        accounts[owner].add(account);
        accountOwners[account] = owner;
        allAccounts.push(account);
        isAccount[account] = true;

        // emit creation event
        emit AccountCreated(owner, accountId);
    }

    /**
     * @notice Hook for accounts to transfer the ownership in the factory storage
     * @param _newOwner the new owner of the account
     */
    function handleTransferAccount(address _newOwner) external {
        require(_newOwner != address(0), "Owner cannot be zero address.");
        address sendingAccount = msg.sender;
        require(isAccount[sendingAccount], "Can only be called through an account.");
        address originalOwner = accountOwners[sendingAccount];
        accountOwners[sendingAccount] = _newOwner;
        accounts[originalOwner].remove(sendingAccount);
        accounts[_newOwner].add(sendingAccount);
    }

    function setModuleProvider(address _newProvider) external onlyAdmin {
        moduleProvider = _newProvider;
    }

    function setDataProvider(address _newDataProvider) external onlyAdmin {
        dataProvider = _newDataProvider;
    }

    function getAccounts(address _owner) external view returns (address[] memory userAccounts) {
        userAccounts = accounts[_owner].values();
    }

    function getAccount(address _owner, uint256 _accountIndex) external view returns (address) {
        return accounts[_owner].at(_accountIndex);
    }

    function getAccountMeta(address _owner) external view returns (AccountMetadata[] memory accountMeta) {
        uint256 accountCount = accounts[_owner].length();
        accountMeta = new AccountMetadata[](accountCount);
        for (uint256 i = 0; i < accountCount; i++) {
            address account = accounts[_owner].at(i);
            accountMeta[i] = IAccountMeta(account).fetchAccountMetadata();
        }
    }

    function getSingleAccountMeta(address _owner, uint256 _index) external view returns (AccountMetadata memory accountMeta) {
        accountMeta = IAccountMeta(accounts[_owner].at(_index)).fetchAccountMetadata();
    }
}

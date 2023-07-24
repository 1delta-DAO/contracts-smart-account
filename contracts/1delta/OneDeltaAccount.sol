// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* Author: Achthar - 1delta.io
* Title:  1Delta Margin Trading Account
* Implementation of a diamond that fetches its modules from another contract.
/******************************************************************************/

import {GeneralStorage, LibGeneral} from "./libraries/LibGeneral.sol";
import {IModuleProvider} from "./interfaces/IModuleProvider.sol";

contract OneDeltaAccount {
    // provider is immutable and therefore stored in the bytecode
    address private immutable _moduleProvider;
    // selector for module fetching
    bytes4 private immutable SELECTOR = 0xd88f725a; //=bytes4(abi.encodeWithSignature("selectorToModule(bytes4)"))

    function moduleProvider() external view returns (IModuleProvider) {
        return IModuleProvider(_moduleProvider);
    }

    // the constructor only initializes the module provider
    // the modules are provided by views in this module provider contract
    // the  cut module is not existing in this contract, it is implemented in the provider
    constructor(address provider) {
        GeneralStorage storage ds = LibGeneral.generalStorage();
        // we put the provider in the  storage, too
        ds.moduleProvider = provider;
        ds.factory = msg.sender;

        // assign immutable
        _moduleProvider = provider;
    }

    // An efficient multicall implementation for 1delta Accounts across multiple modules
    // The modules are validated before anything is called.
    function multicall(address[] calldata modules, bytes[] calldata data) external payable returns (bytes[] memory results) {
        results = new bytes[](data.length);
        // we check that all modules exist in a single call
        IModuleProvider(_moduleProvider).validateModules(modules);
        for (uint256 i = 0; i < data.length; i++) {
            (bool success, bytes memory result) = modules[i].delegatecall(data[i]);

            if (!success) {
                // Next 5 lines from https://ethereum.stackexchange.com/a/83577
                if (result.length < 68) revert();
                assembly {
                    result := add(result, 0x04)
                }
                revert(abi.decode(result, (string)));
            }

            results[i] = result;
        }
    }

    // Find module for function that is called and execute the
    // function if a module is found and return any value.
    fallback() external payable {
        bytes4 fnSig = SELECTOR;
        bytes4 callSignature = msg.sig;
        address moduleSlot = _moduleProvider;
        assembly {
            // 1) FETCH MODULE
            // Get the free memory address with the free memory pointer
            let params := mload(0x40)

            // We store 0x24 bytes, so we increment the free memory pointer
            // by that exact amount to keep things in order
            mstore(0x40, add(params, 0x24))

            // Store fnSig at params : here we store 32 bytes : 4 bytes of fnSig and 28 bytes of RIGHT padding
            mstore(params, fnSig)

            // Store callSignature at params + 0x4 : overwriting the 28 bytes of RIGHT padding included before
            mstore(add(params, 0x4), callSignature)

            // gas : 5000 for module fetch
            // address : moduleSlot -> moduleProvider
            // argsOffset : encoded : msg.sig
            // argsSize : 0x24
            // retOffset : params
            // retSize : address size
            let success := staticcall(5000, moduleSlot, params, 0x24, params, 0x20)

            if eq(success, 0) {
                revert(params, 0x40)
            }

            // overwrite the moduleSlot parameter with the fetched module address (if valid)
            moduleSlot := mload(params)

            // revert if module address is zero
            if eq(moduleSlot, 0) {
                revert(0, 0)
            }

            // 2) EXECUTE DELEGATECALL ON FETCHED MODULE
            // copy function selector and any arguments
            calldatacopy(0, 0, calldatasize())
            // execute function call using the module
            success := delegatecall(gas(), moduleSlot, 0, calldatasize(), 0, 0)
            // get any return value
            returndatacopy(0, 0, returndatasize())
            // return any return value or error back to the caller
            switch success
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    receive() external payable {}
}

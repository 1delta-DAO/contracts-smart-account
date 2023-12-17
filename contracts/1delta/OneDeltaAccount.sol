// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.0;

/******************************************************************************\
* Author: Achthar - 1delta.io
* Title:  1delta Account
* Implementation of a diamond that fetches its modules from another contract.
/******************************************************************************/

contract OneDeltaAccount {
    // provider is immutable and therefore stored in the bytecode
    address private immutable MODULE_PROVIDER;

    // the constructor only initializes the module provider
    // the modules are provided by views in this module provider contract
    // the cut module is not existing in this contract, it is implemented in the provider
    constructor(address provider) {
        // assign immutable
        MODULE_PROVIDER = provider;
    }

    // An efficient multicall implementation for 1delta Accounts across multiple modules
    // The modules are validated before anything is called.
    function multicall(bytes[] calldata data) external payable {
        // we check that all modules exist in a single call
        address moduleProvider = MODULE_PROVIDER;
        for (uint256 i; i != data.length; ) {
            bytes calldata call = data[i];
            assembly {
                let len := call.length
                calldatacopy(0x60, call.offset, len) // copy calldata to 0x60 / 96
                // 1) FETCH MODULE
                // Get the free memory pointer
                let params := mload(0x40)

                // We store 0x24 bytes, so we increment the free memory pointer
                // by that exact amount to keep things in order
                mstore(0, add(params, 0x24))

                // Store fnSig (=bytes4(abi.encodeWithSignature("selectorToModule(bytes4)"))) at params
                // - here we store 32 bytes : 4 bytes of fnSig and 28 bytes of RIGHT padding
                mstore(params, 0xd88f725a00000000000000000000000000000000000000000000000000000000)

                // Store callSignature at params + 0x4 : overwriting the 28 bytes of RIGHT padding included before
                mstore(add(params, 0x4), and(mload(0x60), 0xFFFFFFFF00000000000000000000000000000000000000000000000000000000))
                // gas : 5000 for module fetch
                // address : moduleSlot -> moduleProvider
                // argsOffset : encoded : msg.sig
                // argsSize : 0x24
                // retOffset : params
                // retSize : address size
                let success := staticcall(5000, moduleProvider, params, 0x24, params, 0x20)

                if iszero(success) {
                    revert(params, 0)
                }

                // get moduleSlot parameter with the fetched module address (if valid)
                let moduleSlot := mload(params)

                // revert if module address is zero
                if iszero(moduleSlot) {
                    // Revert with:
                    // abi.encodeWithSelector(
                    //   bytes4(keccak256("NoImplementation()")))
                    mstore(0, 0x6826a5a500000000000000000000000000000000000000000000000000000000)
                    revert(0, 4)
                }

                // 2) EXECUTE DELEGATECALL ON FETCHED MODULE
                // // copy function selector and any arguments
                // // exescute function call using the module
                success := delegatecall(gas(), moduleSlot, 0x60, len, 0, 0)
                // // revert if not successful - do not return any values on success
                if iszero(success) {
                    returndatacopy(0, 0, returndatasize())
                    revert(0, returndatasize())
                }
                // increase loop index
                i := add(i, 1)
            }
        }
    }

    // Find module for function that is called and execute the
    // function if a module is found and return any value.
    fallback() external payable {
        address moduleSlot = MODULE_PROVIDER;
        assembly {
            // 1) FETCH MODULE
            // Get the scrap space pointer
            let params := mload(0)

            // We store 0x24 bytes, so we increment the memory pointer
            // by that exact amount to keep things in order
            mstore(0, add(params, 0x24))

            // Store fnSig (=bytes4(abi.encodeWithSignature("selectorToModule(bytes4)"))) at params
            // - here we store 32 bytes : 4 bytes of fnSig and 28 bytes of RIGHT padding
            mstore(params, 0xd88f725a00000000000000000000000000000000000000000000000000000000)

            // Store callSignature at params + 0x4 : overwriting the 28 bytes of RIGHT padding included before
            mstore(add(params, 0x4), and(calldataload(0), 0xFFFFFFFF00000000000000000000000000000000000000000000000000000000))

            // gas : 5000 for module fetch
            // address : moduleSlot -> moduleProvider
            // argsOffset : encoded : msg.sig
            // argsSize : 0x24
            // retOffset : params
            // retSize : address size
            let success := staticcall(5000, moduleSlot, params, 0x24, params, 0x20)

            if iszero(success) {
                revert(params, 0)
            }

            // overwrite the moduleSlot parameter with the fetched module address (if valid)
            moduleSlot := mload(params)

            // revert if module address is zero
            if iszero(moduleSlot) {
                // Revert with:
                // abi.encodeWithSelector(
                //   bytes4(keccak256("NoImplementation()")))
                mstore(0, 0x6826a5a500000000000000000000000000000000000000000000000000000000)
                revert(0, 4)
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

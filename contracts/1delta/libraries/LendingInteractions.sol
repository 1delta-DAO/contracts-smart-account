// SPDX-License-Identifier: MIT

pragma solidity ^0.8.21;

import "../../interfaces/IERC20.sol";
import {ICompoundTypeCERC20} from "../interfaces/compound/ICompoundTypeCERC20.sol";
import {ICompoundTypeCEther} from "../interfaces/compound/ICompoundTypeCEther.sol";

// assembly library for efficient compound style lending interactions
abstract contract LendingInteractions {
    // Mask of the lower 20 bytes of a bytes32.
    uint256 private constant ADDRESS_MASK = 0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff;

    address internal immutable cNative;

    constructor(address _cNative) {
        cNative = _cNative;
    }

    function _mint(address cAsset, uint256 amount) internal {
        address _cAsset = cNative;
        assembly {
            switch eq(cAsset, _cAsset)
            case 1 {
                let ptr := mload(0x40) // free memory pointer
                // selector for mint()
                mstore(ptr, 0x1249c58b00000000000000000000000000000000000000000000000000000000)

                let result := call(
                    gas(),
                    _cAsset,
                    amount,
                    ptr, // input selector
                    0x4, // input size = selector
                    0x0, // output = empty
                    0x0 // output size = zero
                )
                
            }
            default {
                return(0, returndatasize())
            }
            let ptr := mload(0x40) // free memory pointer

            // selector for deposit()
            mstore(ptr, 0xa0712d6800000000000000000000000000000000000000000000000000000000)
            mstore(add(ptr, 0x4), amount)
            pop(
                call(
                    gas(),
                    _cAsset,
                    0x0,
                    ptr, // input = empty for fallback
                    0x24, // input size = zero
                    0x0, // output = empty
                    0x0 // output size = zero
                )
            )
        }
    }

    function cToken(address _underlying) internal view virtual returns (ICompoundTypeCERC20);

    function cEther() internal view virtual returns (ICompoundTypeCEther);
}

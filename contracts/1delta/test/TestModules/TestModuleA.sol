// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract TestModuleA {
    event TestEvent(address something);

    function testAFunc1(uint a) external {
        console.log("FuncA1");
    }

    function testAFunc2() external {}

    function testAFunc3() external {}

    function testAFunc4() external {}

    function testAFunc5() external {}

    function testAFunc6() external {}

    function testAFunc7() external {}

    function testAFunc8() external {}

    function testAFunc9() external {}

    function testAFunc10() external {}

    function testAFunc11() external {}

    function testAFunc12() external {}

    function testAFunc13() external {}

    function testAFunc14() external {}

    function testAFunc15() external {}

    function testAFunc16() external {}

    function testAFunc17() external {}

    function testAFunc18() external {}

    function testAFunc19() external {}

    function testAFunc20() external {}

    function g(uint256[] calldata x, uint256 index) external returns (uint256 val) {
        assembly {
            switch lt(val, x.length)
            case 0 {
                val := 0xFF
            }
            default {
                val := calldataload(add(x.offset, mul(index, 32)))
            }
        }
    }

    function supportsInterface(bytes4 _interfaceID) external view returns (bool) {}
}

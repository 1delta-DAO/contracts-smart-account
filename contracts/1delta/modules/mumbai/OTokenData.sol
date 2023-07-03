// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {ICompoundTypeCERC20} from "../../interfaces/compound/ICompoundTypeCERC20.sol";
import {ICompoundTypeCEther} from "../../interfaces/compound/ICompoundTypeCEther.sol";
import {IComptroller} from "../../interfaces/compound/IComptroller.sol";

// solhint-disable max-line-length

/**
 * @title Contract that holds compund data hard-coded to inherit to modules
 * @notice modules that use this data should inherit from this contract to prevent external function calls from data
 * the data is hard coded here and can be upgraded through a module adjustment on the module using it
 */
abstract contract OTokenData {
    // constructor will not conflict with proxies due to immutability
    constructor() {}

    address private immutable WMATIC = 0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889;

    address private immutable oMATIC = 0xcf48fD4dF32097f482809E45E361C9667df32F90;

    address private immutable WBTC = 0xEB8df6700E24802a5D435E5B0e4228065CA9E0f3;
    address private immutable oWBTC = 0xF151CC6EE64046342D8287660596fb78D2212A23;

    address private immutable oDAI = 0xcb9F13Cb8cCA0ECfE908AbBfa25D1fc16C1aaE6d;
    address private immutable DAI = 0xcB1e72786A6eb3b44C2a2429e317c8a2462CFeb1;

    address private immutable oWETH = 0xFcCea9c3bb8e2fEFE9E2c7EFa1C63890Cf6F69b6;
    address private immutable WETH = 0x714550C2C1Ea08688607D86ed8EeF4f5E4F22323;

    address private immutable oUSDC = 0x4413dbCf851D73bEc0BBF50b474EA89bded11153;
    address private immutable USDC = 0xe6b8a5CF854791412c1f6EFC7CAf629f5Df1c747;

    address private immutable oUSDT = 0x2ed82022025374fcC839D557c7a360099244e06b;
    address private immutable USDT = 0x3813e82e6f7098b9583FC0F33a962D02018B6803;

    // unitroller address
    address private immutable comptroller = 0x8849f1a0cB6b5D6076aB150546EddEe193754F1C;

    function _cToken(address _underlying) internal view returns (ICompoundTypeCERC20) {
        if (_underlying == USDC) return ICompoundTypeCERC20(oUSDC);
        if (_underlying == USDT) return ICompoundTypeCERC20(oUSDT);
        if (_underlying == DAI) return ICompoundTypeCERC20(oDAI);
        if (_underlying == WETH) return ICompoundTypeCERC20(oWETH);
        if (_underlying == WBTC) return ICompoundTypeCERC20(oWBTC);
        // will cause errors if not handled separately in some instances
        if (_underlying == WMATIC) return ICompoundTypeCERC20(oMATIC);

        revert("no cToken for this underlying");
    }

    function _cEther() internal view returns (ICompoundTypeCEther) {
        return ICompoundTypeCEther(oMATIC);
    }

    function _getComptroller() internal view returns (IComptroller) {
        return IComptroller(comptroller);
    }
}

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
abstract contract GoerliCompoundCTokenData {
    // constructor will not conflict with proxies due to immutability
    constructor() {}

    address private immutable WETH = 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6;
    address private immutable cCOMP = 0x0fF50a12759b081Bb657ADaCf712C52bb015F1Cd;
    address private immutable cDAI = 0x0545a8eaF7ff6bB6F708CbB544EA55DBc2ad7b2a;
    address private immutable cETH = 0x64078a6189Bf45f80091c6Ff2fCEe1B15Ac8dbde;
    address private immutable cUNI = 0x2073d38198511F5Ed8d893AB43A03bFDEae0b1A5;
    address private immutable cUSDC = 0x73506770799Eb04befb5AaE4734e58C2C624F493;
    address private immutable cUSDT = 0x5A74332C881Ea4844CcbD8458e0B6a9B04ddb716;
    address private immutable cWBTC = 0xDa6F609F3636062E06fFB5a1701Df3c5F1ab3C8f;
    address private immutable COMP = 0x3587b2F7E0E2D6166d6C14230e7Fe160252B0ba4;
    address private immutable DAI = 0x2899a03ffDab5C90BADc5920b4f53B0884EB13cC;
    address private immutable UNI = 0x208F73527727bcB2D9ca9bA047E3979559EB08cC;
    address private immutable USDC = 0x07865c6E87B9F70255377e024ace6630C1Eaa37F;
    address private immutable USDT = 0x79C950C7446B234a6Ad53B908fBF342b01c4d446;
    address private immutable WBTC = 0xAAD4992D949f9214458594dF92B44165Fb84dC19;

    // unitroller address
    address private immutable comptroller = 0x05Df6C772A563FfB37fD3E04C1A279Fb30228621;

    function _cToken(address _underlying) internal view returns (ICompoundTypeCERC20) {
        if (_underlying == COMP) return ICompoundTypeCERC20(cCOMP);
        if (_underlying == DAI) return ICompoundTypeCERC20(cDAI);
        if (_underlying == UNI) return ICompoundTypeCERC20(cUNI);
        if (_underlying == USDC) return ICompoundTypeCERC20(cUSDC);
        if (_underlying == USDT) return ICompoundTypeCERC20(cUSDT);
        if (_underlying == WBTC) return ICompoundTypeCERC20(cWBTC);
        // will cause errors if not handled separately in some instances
        if (_underlying == WETH) return ICompoundTypeCERC20(cETH);

        revert("no cToken for this underlying");
    }

    function _cEther() internal view returns (ICompoundTypeCEther) {
        return ICompoundTypeCEther(cETH);
    }

    function _getComptroller() internal view returns (IComptroller) {
        return IComptroller(comptroller);
    }
}

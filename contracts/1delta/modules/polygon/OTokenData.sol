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

    address private immutable WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    address private immutable oMATIC = 0xE554E874c9c60E45F1Debd479389C76230ae25A8;

    address private immutable WBTC = 0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6;
    address private immutable oWBTC = 0x3B9128Ddd834cE06A60B0eC31CCfB11582d8ee18;

    address private immutable oDAI = 0x2175110F2936bf630a278660E9B6E4EFa358490A;
    address private immutable DAI = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;

    address private immutable oWETH = 0xb2D9646A1394bf784E376612136B3686e74A325F;
    address private immutable WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;

    address private immutable oUSDC = 0xEBb865Bf286e6eA8aBf5ac97e1b56A76530F3fBe;
    address private immutable USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

    address private immutable oUSDT = 0x1372c34acC14F1E8644C72Dad82E3a21C211729f;
    address private immutable USDT = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F;

    address private immutable oMAI = 0xC57E5e261d49Af3026446de3eC381172f17bB799;
    address private immutable MAI = 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1;

    address private immutable oMATICX = 0xAAcc5108419Ae55Bc3588E759E28016d06ce5F40;
    address private immutable MATICX = 0xfa68FB4628DFF1028CFEc22b4162FCcd0d45efb6;

    address private immutable oSTMATIC = 0xDc3C5E5c01817872599e5915999c0dE70722D07f;
    address private immutable STMATIC = 0x3A58a54C066FdC0f2D55FC9C89F0415C92eBf3C4;

    address private immutable oJEUR = 0x29b0F07d5A61595685a17D5F9F86313742Ebd6Bc;
    address private immutable JEUR = 0x4e3Decbb3645551B8A19f0eA1678079FCB33fB4c;

    address private immutable oGDAI = 0x6F063Fe661d922e4fd77227f8579Cb84f9f41F0B;
    address private immutable GDAI = 0x91993f2101cc758D0dEB7279d41e880F7dEFe827;

    address private immutable oVGHST = 0xE053A4014b50666ED388ab8CbB18D5834de0aB12;
    address private immutable VGHST = 0x51195e21BDaE8722B29919db56d95Ef51FaecA6C;

    address private immutable oWSTETH = 0xf06edA703C62b9889C75DccDe927b93bde1Ae654;
    address private immutable WSTETH = 0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD;

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
        if (_underlying == MAI) return ICompoundTypeCERC20(oMAI);
        if (_underlying == MATICX) return ICompoundTypeCERC20(oMATICX);
        if (_underlying == STMATIC) return ICompoundTypeCERC20(oSTMATIC);
        if (_underlying == JEUR) return ICompoundTypeCERC20(oJEUR);
        if (_underlying == GDAI) return ICompoundTypeCERC20(oGDAI);
        if (_underlying == VGHST) return ICompoundTypeCERC20(oVGHST);
        if (_underlying == WSTETH) return ICompoundTypeCERC20(oWSTETH);

        revert("no cToken for this underlying");
    }

    function _cEther() internal view returns (ICompoundTypeCEther) {
        return ICompoundTypeCEther(oMATIC);
    }

    function _getComptroller() internal view returns (IComptroller) {
        return IComptroller(comptroller);
    }
}

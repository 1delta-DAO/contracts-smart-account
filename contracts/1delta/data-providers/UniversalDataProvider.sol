// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;

import {DataProviderStorageGenesis} from "./UniversalDataProviderStorage.sol";

// data provider implementation
// trade modules not regularly fetch from here as it is gas-inefficient
contract UniversalDataProvider is DataProviderStorageGenesis {
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can interact");
        _;
    }

    function addCollateralToken(address _underlying, address _cToken, uint lenderId) external onlyAdmin {
        _collateralTokens[lenderId][_underlying] = _cToken;
    }

    function addEtherCollateralToken(address _cToken, uint lenderId) external onlyAdmin {
        _cEthers[lenderId] = _cToken;
    }

    function addLendingPool(address _comptrollerToAdd, uint lenderId) external onlyAdmin {
        _lendingCore[lenderId] = _comptrollerToAdd;
    }

    function collateralToken(address _underlying, uint lenderId) external view returns (address) {
        return _collateralTokens[lenderId][_underlying];
    }

    function collateralTokenPair(
        address _underlying,
        uint id,
        address _underlyingOther,
        uint idOther
    ) external view returns (address _cToken, address _cTokenOther) {
        return (_collateralTokens[id][_underlying], _collateralTokens[idOther][_underlyingOther]);
    }
}

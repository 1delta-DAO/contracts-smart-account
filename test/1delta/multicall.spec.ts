import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { constants } from 'ethers';
import { ethers, network } from 'hardhat'
import { ERC20Base__factory, MarginTraderModule, OneDeltaAccount, OneDeltaAccount__factory, OneDeltaModuleManager, OneDeltaModuleManager__factory, TestModuleA, TestModuleA__factory, TestModuleB, TestModuleB__factory, TestModuleC, TestModuleC__factory } from '../../types';
import { FeeAmount } from '../uniswap-v3/periphery/shared/constants';
import { expandTo18Decimals } from '../uniswap-v3/periphery/shared/expandTo18Decimals';
import { encodePath } from '../uniswap-v3/periphery/shared/path';
import {
    accountFactoryFixture,
    AccountFactoryFixture,
    accountFactoryFixtureInclV2,
    createMarginTradingAccount,
    createMoneyMarketAccount,
    enterMarkets,
    feedCompound,
    feedCompoundETH,
    feedProvider,
    getMoneyMarketContract,
    getRawAccount,
    repayBorrowToCompound
} from './shared/accountFactoryFixture';
import { CompoundFixture, CompoundOptions, generateCompoundFixture } from './shared/compoundFixture';
import { expect } from './shared/expect'
import { ONE_18 } from './shared/marginSwapFixtures';
import { addLiquidity, uniswapFixture, UniswapFixture } from './shared/uniswapFixture';
import { ModuleConfigAction, getContractSelectors } from '../diamond/libraries/diamond';


// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Diamond Money Market operations', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress, gabi: SignerWithAddress, achi: SignerWithAddress;
    let uniswap: UniswapFixture
    let moduleManager: OneDeltaModuleManager
    let moduleA: TestModuleA
    let moduleB: TestModuleB
    let moduleC: TestModuleC
    before('Deploy Account, Trader, Uniswap and Compound', async () => {
        [deployer, alice, bob, carol, gabi, achi] = await ethers.getSigners();

        uniswap = await uniswapFixture(deployer, 5)

        moduleA = await new TestModuleA__factory(deployer).deploy()
        moduleB = await new TestModuleB__factory(deployer).deploy()
        moduleC = await new TestModuleC__factory(deployer).deploy()
        moduleManager = await new OneDeltaModuleManager__factory(deployer).deploy()

        await moduleManager.configureModules([
            {
                moduleAddress: moduleA.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getContractSelectors(moduleA)
            },
            {
                moduleAddress: moduleB.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getContractSelectors(moduleB)
            },
            // {
            //     moduleAddress: moduleC.address,
            //     action: ModuleConfigAction.Add,
            //     functionSelectors: getContractSelectors(moduleC)
            // },
        ])

    })

    it('multicall', async () => {

        const call1 = moduleA.interface.encodeFunctionData('testAFunc1', [88])
        const call2 = moduleB.interface.encodeFunctionData('testBFunc20')
        const proxy = await new OneDeltaAccount__factory(deployer).deploy(moduleManager.address)
        await proxy.multicall([call1, call2])
    })

    it('throws correct error', async () => {

        const call1 = ERC20Base__factory.createInterface().encodeFunctionData('totalSupply')
        const call2 = moduleB.interface.encodeFunctionData('testBFunc20')

        const proxy = await new OneDeltaAccount__factory(deployer).deploy(moduleManager.address)
        // test for multicall
        await expect(proxy.multicall([call1, call2])).to.be.revertedWith('')
        // test for base call
        const newCont = await new TestModuleC__factory(deployer).attach(proxy.address)
        await expect(newCont.testCFunc1()).to.be.revertedWith('')
    })

})


// ·----------------------------------------------------------------------------------------------|---------------------------|-----------------|-----------------------------·
// |                                     Solc version: 0.8.21                                     ·  Optimizer enabled: true  ·  Runs: 1000000  ·  Block limit: 30000000 gas  │
// ·······························································································|···························|·················|······························
// ························································|······································|·············|·············|·················|···············|··············
// |  OneDeltaAccount                                      ·  multicall                           ·     559946  ·    1031548  ·         795747  ·            2  ·          -  │
// ························································|······································|·············|·············|·················|···············|··············





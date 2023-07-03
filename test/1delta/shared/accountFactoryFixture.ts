
import { ethers } from 'hardhat'
import {
    AccountInit,
    AccountInit__factory,
    DelegatorModule,
    DelegatorModule__factory,
    OneDeltaModuleManager,
    OneDeltaModuleManager__factory,
    IWETH9,
    MarginTraderModule,
    MarginTraderModule__factory,
    MinimalSwapRouter,
    MinimalSwapRouter__factory,
    MoneyMarketModule,
    MoneyMarketModule__factory,
    UniswapCallbackModule,
    UniswapCallbackModule__factory,
    UniswapV3Factory,
    DataProvider,
    DataProvider__factory,
    DataProviderProxy__factory,
    OneDeltaAccountFactory,
    OneDeltaAccountFactory__factory,
    OneDeltaAccountFactoryProxy__factory,
    OneDeltaAccount,
    OneDeltaAccount__factory,
    TokenManagerModule,
    TokenManagerModule__factory,
    OneDeltaModuleManagerProxy,
    OneDeltaModuleManagerProxy__factory,
    OneDeltaModuleHandler__factory,
    OneDeltaModuleHandler,
    SweeperModule,
    SweeperModule__factory,
} from '../../../types'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { ModuleConfigAction, getSelectors } from '../../diamond/libraries/diamond'
import OneDeltaAccountFactoryArtifact from "../../../artifacts/contracts/1delta/OneDeltaAccountFactory.sol/OneDeltaAccountFactory.json"
import OneDeltaAccountFactoryProxyArtifact from "../../../artifacts/contracts/1delta/OneDeltaAccountFactoryProxy.sol/OneDeltaAccountFactoryProxy.json"
import DataProviderArtifact from "../../../artifacts/contracts/1delta/data-providers/DataProvider.sol/DataProvider.json"
import DataProviderProxyArtifact from "../../../artifacts/contracts/1delta/data-providers/DataProviderProxy.sol/DataProviderProxy.json"
import OneDeltaModuleHandlerArtifact from "../../../artifacts/contracts/1delta/module-manager/OneDeltaModuleHandler.sol/OneDeltaModuleHandler.json"
import OneDeltaModuleManagerProxyArtifact from "../../../artifacts/contracts/1delta/module-manager/OneDeltaModuleManagerProxy.sol/OneDeltaModuleManagerProxy.json"
import { CompoundFixture } from './compoundFixture'
import { BigNumber } from 'ethers'
import { UniswapFixture } from './uniswapFixture'
import { expandTo18Decimals } from '../../uniswap-v3/periphery/shared/expandTo18Decimals'
import MoneyMarketArtifact from "../../../artifacts/contracts/1delta/modules/MoneyMarketModule.sol/MoneyMarketModule.json"
import SweeperArtifact from "../../../artifacts/contracts/1delta/modules/SweeperModule.sol/SweeperModule.json"

export interface AccountFactoryFixture {
    diamondDeployer: OneDeltaAccountFactory
    moduleManager: OneDeltaModuleManager
    moneyMarketModule: MoneyMarketModule
    marginTraderModule: MarginTraderModule
    SweeperModule: SweeperModule
    dataProvider: DataProvider
    accountInit: AccountInit
    delegatorModule: DelegatorModule
}

export async function accountFactoryFixture(signer: SignerWithAddress, factory: UniswapV3Factory, weth: IWETH9): Promise<AccountFactoryFixture> {
    let diamondDeployer: OneDeltaAccountFactory
    let moduleManager: OneDeltaModuleManager
    let moneyMarketModule: MoneyMarketModule
    let SweeperModule: SweeperModule
    let dataProvider: DataProvider
    let accountInit: AccountInit
    let delegatorModule: DelegatorModule
    let marginTraderModule: MarginTraderModule
    let callbackModule: UniswapCallbackModule
    let minimalRouter: MinimalSwapRouter

    moduleManager = await new OneDeltaModuleManager__factory(signer).deploy()
    accountInit = await new AccountInit__factory(signer).deploy()
    delegatorModule = await new DelegatorModule__factory(signer).deploy()
    marginTraderModule = await new MarginTraderModule__factory(signer).deploy(factory.address)
    minimalRouter = await new MinimalSwapRouter__factory(signer).deploy(factory.address, weth.address)
    moneyMarketModule = await new MoneyMarketModule__factory(signer).deploy(factory.address, weth.address, minimalRouter.address)
    SweeperModule = await new SweeperModule__factory(signer).deploy(factory.address, weth.address, minimalRouter.address)

    await moduleManager.connect(signer).configureModules(
        [{
            moduleAddress: accountInit.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(accountInit)
        }]
    )
    await moduleManager.connect(signer).configureModules(
        [{
            moduleAddress: moneyMarketModule.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(moneyMarketModule)
        }]
    )

    await moduleManager.connect(signer).configureModules(
        [{
            moduleAddress: delegatorModule.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(delegatorModule)
        }]
    )

    await moduleManager.connect(signer).configureModules(
        [{
            moduleAddress: marginTraderModule.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(marginTraderModule)
        }]
    )

    await moduleManager.connect(signer).configureModules(
        [{
            moduleAddress: SweeperModule.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(SweeperModule)
        }]
    )


    if (factory && weth) {

        callbackModule = await new UniswapCallbackModule__factory(signer).deploy(factory.address, weth.address, minimalRouter.address)

        // add uniswap callback
        await moduleManager.connect(signer).configureModules(
            [{
                moduleAddress: callbackModule.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getSelectors(callbackModule)
            }]
        )
        console.log("Uniswap modules added")
    }

    dataProvider = await deployDataProvider(signer)

    const diamondDeployerLogic = await new OneDeltaAccountFactory__factory(signer).deploy()

    const diamondDeployerProxy = await new OneDeltaAccountFactoryProxy__factory(signer).deploy()

    await diamondDeployerProxy._setPendingImplementation(diamondDeployerLogic.address)

    await diamondDeployerLogic._become(diamondDeployerProxy.address)

    diamondDeployer = await ethers.getContractAt(
        [...OneDeltaAccountFactoryArtifact.abi, ...OneDeltaAccountFactoryProxyArtifact.abi],
        diamondDeployerProxy.address,
        signer
    ) as OneDeltaAccountFactory

    await diamondDeployer.initialize(moduleManager.address, dataProvider.address)

    return {
        diamondDeployer,
        moduleManager,
        moneyMarketModule,
        dataProvider,
        accountInit,
        delegatorModule,
        marginTraderModule,
        SweeperModule
    }
}

export async function deployDataProvider(signer: SignerWithAddress): Promise<DataProvider> {
    let dataProvider: DataProvider
    const dataProviderLogic = await new DataProvider__factory(signer).deploy()

    const dataProviderProxy = await new DataProviderProxy__factory(signer).deploy()

    await dataProviderProxy._setPendingImplementation(dataProviderLogic.address)

    await dataProviderLogic._become(dataProviderProxy.address)

    dataProvider = await ethers.getContractAt(
        [...DataProviderArtifact.abi, ...DataProviderProxyArtifact.abi],
        dataProviderProxy.address,
        signer
    ) as DataProvider

    return dataProvider
}

export async function getMoneyMarketAccount(signer: SignerWithAddress, account: string): Promise<MoneyMarketModule & SweeperModule> {
    return (await new ethers.Contract(account, [...MoneyMarketArtifact.abi, ...SweeperArtifact.abi], signer)) as MoneyMarketModule & SweeperModule
}


export async function getAbsoluteMarginTraderAccount(signer: SignerWithAddress, account: string): Promise<SweeperModule> {
    return (await new ethers.Contract(account, SweeperModule__factory.createInterface(), signer)) as SweeperModule
}


export async function getTokenManagerAccount(signer: SignerWithAddress, account: string): Promise<TokenManagerModule> {
    return (await new ethers.Contract(account, TokenManagerModule__factory.createInterface(), signer)) as TokenManagerModule
}


export async function getRawAccount(signer: SignerWithAddress, account: string): Promise<OneDeltaAccount> {
    return (await new ethers.Contract(account, OneDeltaAccount__factory.createInterface(), signer)) as OneDeltaAccount
}

export async function createMoneyMarketAccount(signer: SignerWithAddress, fixture: AccountFactoryFixture, setUp = false, name = "test"): Promise<MoneyMarketModule & SweeperModule> {
    await fixture.diamondDeployer.connect(signer).createAccount(name, setUp)
    const accs = await fixture.diamondDeployer.getAccounts(signer.address)
    return (await new ethers.Contract(accs[accs.length - 1], [...MoneyMarketArtifact.abi, ...SweeperArtifact.abi], signer)) as MoneyMarketModule & SweeperModule
}


export async function createMarginTradingAccount(signer: SignerWithAddress, fixture: AccountFactoryFixture, setUp = false, name = "test"): Promise<MarginTraderModule> {
    await fixture.diamondDeployer.connect(signer).createAccount(name, setUp)
    const accs = await fixture.diamondDeployer.getAccounts(signer.address)
    return (await new ethers.Contract(accs[accs.length - 1], MarginTraderModule__factory.createInterface(), signer)) as MarginTraderModule
}

export interface UniswapAccountFactoryFixture {
    diamondDeployer: OneDeltaAccountFactory
    moduleManager: OneDeltaModuleManager
    dataProvider: DataProvider
    accountInit: AccountInit
    delegatorModule: DelegatorModule
}

export async function uniswapAccountFactoryFixture(signer: SignerWithAddress, weth: IWETH9, factory: UniswapV3Factory): Promise<UniswapAccountFactoryFixture> {
    let diamondDeployer: OneDeltaAccountFactory
    let moduleManager: OneDeltaModuleManager
    let dataProvider: DataProvider
    let accountInit: AccountInit
    let delegatorModule: DelegatorModule
    let callbackModule: UniswapCallbackModule
    let minimalRouter: MinimalSwapRouter
    moduleManager = await new OneDeltaModuleManager__factory(signer).deploy()
    accountInit = await new AccountInit__factory(signer).deploy()
    delegatorModule = await new DelegatorModule__factory(signer).deploy()

    minimalRouter = await new MinimalSwapRouter__factory(signer).deploy(factory.address, weth.address)
    callbackModule = await new UniswapCallbackModule__factory(signer).deploy(factory.address, weth.address, minimalRouter.address)

    // add initializer
    await moduleManager.configureModules(
        [{
            moduleAddress: accountInit.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(accountInit)
        }]
    )

    // add reuglar delegator
    await moduleManager.configureModules(
        [{
            moduleAddress: delegatorModule.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(delegatorModule)
        }]
    )

    // add uniswap callback
    await moduleManager.configureModules(
        [{
            moduleAddress: callbackModule.address,
            action: ModuleConfigAction.Add,
            functionSelectors: getSelectors(callbackModule)
        }]
    )


    dataProvider = await deployDataProvider(signer)

    diamondDeployer = await new OneDeltaAccountFactory__factory(signer).deploy()

    await diamondDeployer.initialize(moduleManager.address, dataProvider.address)

    return {
        diamondDeployer,
        moduleManager,
        dataProvider,
        accountInit,
        delegatorModule
    }
}

export async function getUniswapAccount(signer: SignerWithAddress, account: string): Promise<MoneyMarketModule> {
    return (await new ethers.Contract(account, MoneyMarketModule__factory.createInterface(), signer)) as MoneyMarketModule
}

export async function getMoneyMarketContract(acc: string) {
    return await new ethers.Contract(acc, MoneyMarketModule__factory.createInterface()) as MoneyMarketModule
}

export async function enterMarkets(
    signer: SignerWithAddress,
    accountAddress: string,
    compound: CompoundFixture
) {

    const mmC = await getMoneyMarketContract(accountAddress)
    await (mmC.connect(signer)).enterMarkets(compound.cTokens.map(tk => tk.address))
}

export async function supplyToCompound(
    signer: SignerWithAddress,
    accountAddress: string,
    index: number,
    amount: BigNumber,
    uniswap: UniswapFixture
) {
    const supply_underlying = uniswap.tokens[index]
    await supply_underlying.connect(signer).approve(accountAddress, ethers.constants.MaxUint256)
    const mmC = await getMoneyMarketContract(accountAddress)
    await (mmC.connect(signer)).mint(supply_underlying.address, amount)
}

export async function borrowFromCompound(
    signer: SignerWithAddress,
    accountAddress: string,
    index: number,
    amount: BigNumber,
    uniswap: UniswapFixture
) {
    const borrow_underlying = uniswap.tokens[index]
    const mmC = await getMoneyMarketContract(accountAddress)
    await mmC.connect(signer).borrow(borrow_underlying.address, signer.address, amount)
}

export async function feedCompound(
    signer: SignerWithAddress,
    uniswap: UniswapFixture,
    compound: CompoundFixture
) {

    for (let i = 0; i < uniswap.tokens.length; i++) {
        const tok = uniswap.tokens[i]
        const cTok = compound.cTokens[i]
        await tok.connect(signer).approve(cTok.address, ethers.constants.MaxUint256)
        await cTok.connect(signer).mint(expandTo18Decimals(1_000_000))

    }

    await compound.cEther.connect(signer).mint({ value: expandTo18Decimals(100) })
}

export async function feedProvider(
    signer: SignerWithAddress,
    accountFixture: AccountFactoryFixture,
    uniswap: UniswapFixture,
    compound: CompoundFixture
) {
    for (let i = 0; i < uniswap.tokens.length; i++) {
        await accountFixture.dataProvider.connect(signer).addCToken(uniswap.tokens[i].address, compound.cTokens[i].address)
    }
    await accountFixture.dataProvider.connect(signer).setCEther(compound.cEther.address)
    await accountFixture.dataProvider.connect(signer).addCToken(uniswap.weth9.address, compound.cEther.address)
}

export async function feedCompoundETH(
    signer: SignerWithAddress,
    compound: CompoundFixture) {
    await compound.cEther.connect(signer).mint({ value: expandTo18Decimals(1_000) })
}

export async function getOperatorContract(acc: string) {
    return await new ethers.Contract(acc, MoneyMarketModule__factory.createInterface()) as MoneyMarketModule
}

export async function redeemUnderlyingFromCompound(
    signer: SignerWithAddress,
    accountAddress: string,
    index: number,
    amount: BigNumber,
    uniswap: UniswapFixture
) {
    const supply_underlying = uniswap.tokens[index]
    const mmC = await getMoneyMarketContract(accountAddress)
    await supply_underlying.connect(signer).approve(accountAddress, ethers.constants.MaxUint256)
    await mmC.connect(signer).redeemUnderlying(supply_underlying.address, signer.address, amount)
}

export async function repayBorrowToCompound(
    signer: SignerWithAddress,
    accountAddress: string,
    index: number,
    amount: BigNumber,
    uniswap: UniswapFixture
) {
    const borrow_underlying = uniswap.tokens[index]
    await borrow_underlying.connect(signer).approve(signer.address, ethers.constants.MaxUint256)
    const mmC = await getMoneyMarketContract(accountAddress)
    await mmC.connect(signer).repayBorrow(borrow_underlying.address, amount)
}


export async function deployModuleManager(signer: SignerWithAddress): Promise<OneDeltaModuleHandler & OneDeltaModuleManagerProxy> {
    let _moduleManager = await new OneDeltaModuleHandler__factory(signer).deploy()
    const moduleManagerProxy = await new OneDeltaModuleManagerProxy__factory(signer).deploy()

    await moduleManagerProxy._setPendingImplementation(_moduleManager.address)
    await _moduleManager._become(moduleManagerProxy.address)

    const moduleManager = await ethers.getContractAt(
        [...OneDeltaModuleHandlerArtifact.abi, ...OneDeltaModuleManagerProxyArtifact.abi],
        moduleManagerProxy.address,
        signer
    ) as OneDeltaModuleHandler & OneDeltaModuleManagerProxy

    return moduleManager
}

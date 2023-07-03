import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import '@nomiclabs/hardhat-ethers'
import { ethers } from 'hardhat'
import {
    DelegatorModule,
    OneDeltaModuleManager,
    DataProvider,
    OneDeltaModuleManager__factory,
    AccountInit,
    AccountInit__factory,
    MoneyMarketModule,
    MoneyMarketModule__factory,
    DelegatorModule__factory,
    OneDeltaAccountFactory__factory,
    OneDeltaAccountFactoryProxy__factory,
    OneDeltaAccountFactory,
    MarginTraderModule,
    MarginTraderModule__factory,
    MoneyMarketModuleGoerli__factory,
    AdminModule,
    AdminModule__factory,
} from '../../types';
import { ModuleConfigAction, getContractSelectors } from '../diamond/libraries/diamond';
import OneDeltaAccountFactoryArtifact from "../../artifacts/contracts/1delta/OneDeltaAccountFactory.sol/OneDeltaAccountFactory.json"
import OneDeltaAccountFactoryProxyArtifact from "../../artifacts/contracts/1delta/OneDeltaAccountFactoryProxy.sol/OneDeltaAccountFactoryProxy.json"
import { deployDataProvider } from './shared/accountFactoryFixture';

// we prepare a setup for compound in hardhat
// this series of tests checks that the features used for the margin swap implementation
// are correctly set up and working
describe('Diamond Account Factory', async () => {
    let deployer: SignerWithAddress, alice: SignerWithAddress, bob: SignerWithAddress, carol: SignerWithAddress;
    let diamondDeployer: OneDeltaAccountFactory
    let moduleManager: OneDeltaModuleManager
    let moneyMarketModule: MoneyMarketModule
    let marginTradeModule: MarginTraderModule
    let adminModule: AdminModule
    let dataProvider: DataProvider
    let accountInit: AccountInit
    let delegatorModule: DelegatorModule


    beforeEach('get wallets and fixture', async () => {

        [deployer, alice, bob, carol] = await ethers.getSigners();
        moduleManager = await new OneDeltaModuleManager__factory(deployer).deploy()
        accountInit = await new AccountInit__factory(deployer).deploy()
        delegatorModule = await new DelegatorModule__factory(deployer).deploy()
        adminModule = await new AdminModule__factory(deployer).deploy()

        await moduleManager.configureModules(
            [{
                moduleAddress: accountInit.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getContractSelectors(accountInit)
            }]
        )

        moneyMarketModule = await new MoneyMarketModule__factory(deployer).deploy(ethers.constants.AddressZero, ethers.constants.AddressZero, ethers.constants.AddressZero)

        await moduleManager.configureModules(
            [{
                moduleAddress: moneyMarketModule.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getContractSelectors(moneyMarketModule)
            }]
        )

        await moduleManager.configureModules(
            [{
                moduleAddress: delegatorModule.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getContractSelectors(delegatorModule)
            }]
        )


        await moduleManager.configureModules(
            [{
                moduleAddress: adminModule.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getContractSelectors(adminModule)
            }]
        )

        marginTradeModule = await new MarginTraderModule__factory(deployer).deploy(ethers.constants.AddressZero)

        await moduleManager.configureModules(
            [{
                moduleAddress: marginTradeModule.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getContractSelectors(marginTradeModule)
            }]
        )

        dataProvider = await deployDataProvider(deployer)

        const diamondDeployerLogic = await new OneDeltaAccountFactory__factory(deployer).deploy()

        const diamondDeployerProxy = await new OneDeltaAccountFactoryProxy__factory(deployer).deploy()

        await diamondDeployerProxy._setPendingImplementation(diamondDeployerLogic.address)

        await diamondDeployerLogic._become(diamondDeployerProxy.address)

        diamondDeployer = await ethers.getContractAt(
            [...OneDeltaAccountFactoryArtifact.abi, ...OneDeltaAccountFactoryProxyArtifact.abi],
            diamondDeployerProxy.address,
            deployer
        ) as OneDeltaAccountFactory

        await diamondDeployer.initialize(moduleManager.address, dataProvider.address)

    })

    it('allows removal', async () => {
        const selectors = await moduleManager.moduleFunctionSelectors(marginTradeModule.address)
        await moduleManager.configureModules([{
            moduleAddress: ethers.constants.AddressZero,
            action: ModuleConfigAction.Remove,
            functionSelectors: selectors.functionSelectors
        }])
    })

    it('allows add', async () => {

        const selectors = await moduleManager.moduleFunctionSelectors(marginTradeModule.address)
        await moduleManager.configureModules([{
            moduleAddress: ethers.constants.AddressZero,
            action: ModuleConfigAction.Remove,
            functionSelectors: selectors.functionSelectors
        }])

        const marginTradeModuleG = await new MarginTraderModule__factory(deployer).deploy(ethers.constants.AddressZero)

        await moduleManager.configureModules(
            [{
                moduleAddress: marginTradeModuleG.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getContractSelectors(marginTradeModuleG)
            }]
        )
    })

    it('allows dual removal', async () => {
        const selectors = await moduleManager.moduleFunctionSelectors(marginTradeModule.address)
        const selectorsMM = await moduleManager.moduleFunctionSelectors(moneyMarketModule.address)
        await moduleManager.configureModules([
            {
                moduleAddress: ethers.constants.AddressZero,
                action: ModuleConfigAction.Remove,
                functionSelectors: selectors.functionSelectors
            },
            {
                moduleAddress: ethers.constants.AddressZero,
                action: ModuleConfigAction.Remove,
                functionSelectors: selectorsMM.functionSelectors
            }
        ])
    })

    it('allows add', async () => {

        const selectors = await moduleManager.moduleFunctionSelectors(marginTradeModule.address)
        const selectorsMM = await moduleManager.moduleFunctionSelectors(moneyMarketModule.address)
        await moduleManager.configureModules([
            {
                moduleAddress: ethers.constants.AddressZero,
                action: ModuleConfigAction.Remove,
                functionSelectors: selectors.functionSelectors
            },
            {
                moduleAddress: ethers.constants.AddressZero,
                action: ModuleConfigAction.Remove,
                functionSelectors: selectorsMM.functionSelectors
            }
        ])

        const marginTradeModuleG = await new MarginTraderModule__factory(deployer).deploy(ethers.constants.AddressZero) // no update
        const mmModuleG = await new MoneyMarketModuleGoerli__factory(deployer).deploy(ethers.constants.AddressZero, ethers.constants.AddressZero, ethers.constants.AddressZero) // efficient update
        await moduleManager.configureModules(
            [
                {
                    moduleAddress: marginTradeModuleG.address,
                    action: ModuleConfigAction.Add,
                    functionSelectors: getContractSelectors(marginTradeModuleG)
                },
                {
                    moduleAddress: mmModuleG.address,
                    action: ModuleConfigAction.Add,
                    functionSelectors: getContractSelectors(mmModuleG)
                }
            ]
        )
    })
})

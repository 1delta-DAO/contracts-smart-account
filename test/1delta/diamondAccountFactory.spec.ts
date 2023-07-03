import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
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
    AdminModule,
    AdminModule__factory,
} from '../../types';
import { ModuleConfigAction, getSelectors } from '../diamond/libraries/diamond';
import { expect } from './shared/expect'
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
                functionSelectors: getSelectors(accountInit)
            }]
        )

        moneyMarketModule = await new MoneyMarketModule__factory(deployer).deploy(ethers.constants.AddressZero, ethers.constants.AddressZero, ethers.constants.AddressZero)

        await moduleManager.configureModules(
            [{
                moduleAddress: moneyMarketModule.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getSelectors(moneyMarketModule)
            }]
        )

        await moduleManager.configureModules(
            [{
                moduleAddress: delegatorModule.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getSelectors(delegatorModule)
            }]
        )


        await moduleManager.configureModules(
            [{
                moduleAddress: adminModule.address,
                action: ModuleConfigAction.Add,
                functionSelectors: getSelectors(adminModule)
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

    it('deploys account', async () => {
        const accountName = "testName"
        await diamondDeployer.connect(alice).createAccount(accountName, false)
        const accounts = await diamondDeployer.getAccounts(alice.address)
        expect(accounts.length).to.equal(1)
        const meta = await diamondDeployer.getAccountMeta(alice.address)
        expect(meta.length).to.equal(1)
        expect(meta[0].accountName).to.equal(accountName)
    })

    it('allows manager assignment', async () => {
        await diamondDeployer.connect(alice).createAccount("testName", false)

        const accounts = await diamondDeployer.getAccounts(alice.address)

        const ac = await new ethers.Contract(accounts[0], DelegatorModule__factory.createInterface()) as DelegatorModule
        await ac.connect(alice).addManager(deployer.address)
        let isManager = await ac.connect(alice).isManager(deployer.address)
        expect(isManager).to.equal(true)

        await ac.connect(alice).removeManager(deployer.address)
        isManager = await ac.connect(alice).isManager(deployer.address)
        expect(isManager).to.equal(false)
    })


    it('allows ownership transfer', async () => {
        await diamondDeployer.connect(alice).createAccount("testName", false)
        const accounts = await diamondDeployer.getAccounts(alice.address)
        const originalAccountLength = accounts.length;

        const ac = await new ethers.Contract(accounts[0], DelegatorModule__factory.createInterface()) as DelegatorModule
        await ac.connect(alice).transferAccountOwnership(bob.address)

        let accountsBob = await diamondDeployer.getAccounts(bob.address)
        // check transferred account address
        expect(accountsBob[0]).to.equal(accounts[originalAccountLength - 1])
        expect(accountsBob.length).to.equal(1)

        const accountsNew = await diamondDeployer.getAccounts(alice.address)
        // check account count
        expect(accountsNew.length).to.equal(accounts.length - 1)

        let accountMetaBob = await diamondDeployer.getSingleAccountMeta(bob.address, 0)
        const acBob = await new ethers.Contract(accountMetaBob.accountAddress, AdminModule__factory.createInterface()) as AdminModule
        const prevOwner = await acBob.connect(bob).previousOwner()
        // check previous owner
        expect(prevOwner).to.equal(alice.address)
        // check that alice has no further control
        await expect(ac.connect(alice).transferAccountOwnership(carol.address)).to.be.revertedWith("Only the account owner can interact.")
    })

    it('validate function works', async () => {
        const modules = await moduleManager.moduleAddresses()
        await moduleManager.validateModules(modules)
        await expect(moduleManager.validateModules([...modules, bob.address])).to.be.revertedWith("OneDeltaModuleManager: Invalid module")
        await expect(moduleManager.validateModules([bob.address])).to.be.revertedWith("OneDeltaModuleManager: Invalid module")
        await expect(moduleManager.validateModules([modules[0], bob.address, modules[1]])).to.be.revertedWith("OneDeltaModuleManager: Invalid module")
        await moduleManager.validateModules([modules[0], modules[1]])
        expect(await moduleManager.moduleExists(modules[0])).to.be.equal(true)
        expect(await moduleManager.moduleExists(bob.address)).to.be.equal(false)
    })

})

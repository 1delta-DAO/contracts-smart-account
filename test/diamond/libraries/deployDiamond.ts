/* global ethers */
/* eslint prefer-const: "off" */

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers } from "hardhat"
import { ConfigModule, ConfigModule__factory, LensModule, LensModule__factory, OwnershipModule, OwnershipModule__factory } from "../../../types"
import { ModuleConfigAction, getSelectors } from "./diamond"

export async function deployDiamond(contractOwner: SignerWithAddress) {

  // deploy ConfigModule
  const ConfigModule = await ethers.getContractFactory('ConfigModule')
  const moduleConfigModule = await ConfigModule.deploy()
  await moduleConfigModule.deployed()
  console.log('ConfigModule deployed:', moduleConfigModule.address)

  // deploy Diamond
  const Diamond = await ethers.getContractFactory('BrokerProxy')
  const diamond = await Diamond.deploy(contractOwner.address, moduleConfigModule.address)
  await diamond.deployed()
  console.log('Diamond deployed:', diamond.address)

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the moduleConfig function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory('ProxyInit')
  const diamondInit = await DiamondInit.deploy()
  await diamondInit.deployed()
  console.log('DiamondInit deployed:', diamondInit.address)

  // deploy modules
  console.log('')
  console.log('Deploying modules')
  const ModuleNames = [
    'LensModule',
    'OwnershipModule'
  ]
  const cut = []
  for (const ModuleName of ModuleNames) {
    const Module = await ethers.getContractFactory(ModuleName)
    const module = await Module.deploy()
    await module.deployed()
    console.log(`${ModuleName} deployed: ${module.address}`)
    cut.push({
      moduleAddress: module.address,
      action: ModuleConfigAction.Add,
      functionSelectors: getSelectors(module)
    })
  }

  // upgrade diamond with modules
  console.log('')
  console.log('Module Adjustment:', cut)
  const moduleConfig = await ethers.getContractAt('IModuleConfig', diamond.address)
  let tx
  let receipt
  // call to init function
  let functionCall = diamondInit.interface.encodeFunctionData('init')
  tx = await moduleConfig.configureModules(cut, diamondInit.address, functionCall)
  console.log('Module adjustment tx: ', tx.hash)
  receipt = await tx.wait()
  if (!receipt.status) {
    throw Error(`Module adjustment failed: ${tx.hash}`)
  }
  console.log('Completed module adjustment')
  return diamond.address
}

export interface DiamondFixture {
  diamondAddress: string
  moduleConfig: ConfigModule
  diamondLoupe: LensModule
  ownership: OwnershipModule
}
export async function diamondFixture(contractOwner: SignerWithAddress): Promise<DiamondFixture> {

  // deploy ConfigModule
  const ConfigModule = await ethers.getContractFactory('ConfigModule')
  const moduleConfigModule = await ConfigModule.deploy()
  await moduleConfigModule.deployed()

  // deploy Diamond
  const Diamond = await ethers.getContractFactory('BrokerProxy')
  const diamond = await Diamond.deploy(contractOwner.address, moduleConfigModule.address)
  await diamond.deployed()

  // deploy DiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded to initialize state variables
  // Read about how the moduleConfig function works here: https://eips.ethereum.org/EIPS/eip-2535#addingreplacingremoving-functions
  const DiamondInit = await ethers.getContractFactory('ProxyInit')
  const diamondInit = await DiamondInit.deploy()
  await diamondInit.deployed()


  // deploy modules
  const ModuleNames = [
    'LensModule',
    'OwnershipModule'
  ]
  const cut = []
  for (const ModuleName of ModuleNames) {
    const Module = await ethers.getContractFactory(ModuleName)
    const module = await Module.deploy()
    await module.deployed()
    cut.push({
      moduleAddress: module.address,
      action: ModuleConfigAction.Add,
      functionSelectors: getSelectors(module)
    })
  }

  // upgrade diamond with modules
  const moduleConfig = await ethers.getContractAt('IModuleConfig', diamond.address)
  let tx
  let receipt
  // call to init function
  let functionCall = diamondInit.interface.encodeFunctionData('init')
  tx = await moduleConfig.configureModules(cut, diamondInit.address, functionCall)
  receipt = await tx.wait()
  if (!receipt.status) {
    throw Error(`Module adjustment failed: ${tx.hash}`)
  }
  const loupeContract = await new ethers.Contract(diamond.address, LensModule__factory.createInterface(), contractOwner)
  const ownersContract = await new ethers.Contract(diamond.address, OwnershipModule__factory.createInterface(), contractOwner)
  const cutContract = await new ethers.Contract(diamond.address, ConfigModule__factory.createInterface(), contractOwner)
  return {
    diamondAddress: diamond.address,
    moduleConfig: cutContract as ConfigModule,
    diamondLoupe: loupeContract as LensModule,
    ownership: ownersContract as OwnershipModule
  }
}


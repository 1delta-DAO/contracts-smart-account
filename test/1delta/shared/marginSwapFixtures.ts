import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat"
import {
  BoolComptroller,
  BoolComptroller__factory,
  ComptrollerHarness,
  ComptrollerHarness__factory,
  Comp__factory,
  SimplePriceOracle,
  SimplePriceOracle__factory,
  Unitroller,
  Unitroller__factory,
} from "../../../types"

export const ONE_18 = ethers.BigNumber.from(10).pow(18)
export const ZERO = ethers.BigNumber.from(0)
export const ONE = ethers.BigNumber.from(1)


function encodeParameters(types: any, values: any[]) {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
}

export function etherMantissa(num: number | BigNumber, scale: number | BigNumber = ONE_18) {
  if (num < 0)
    return ethers.BigNumber.from(2).pow(256).add(num);
  return ethers.BigNumber.from(num).mul(scale);
}

export interface ComptrollerFixture {
  unitroller: Unitroller
  comptroller: ComptrollerHarness | BoolComptroller
  comptrollerLogic: ComptrollerHarness | BoolComptroller
  oracle: SimplePriceOracle
  // token1: TestERC20
  // token2: TestERC20
}

export function dfn(val: number | BigNumber, def: number) {
  return isFinite(val instanceof BigNumber ? val.toNumber() : val) ? val : def;
}


interface ComptrollerOptions {
  root?: string
  kind?: string
  compRate?: BigNumber
  closeFactor?: BigNumber
}

export async function comptrollerFixture(
  signer: SignerWithAddress,
  opts: ComptrollerOptions = { compRate: ONE_18, closeFactor: ONE_18.mul(51).div(1000) }
): Promise<ComptrollerFixture> {

  let comptrollerLogic;
  const {
    root = signer.address,
    kind = 'unitroller'
  } = opts || {};

  // deploy unitroller
  const unitroller = await new Unitroller__factory(signer).deploy()

  // deploy oracle
  const priceOracle = await new SimplePriceOracle__factory(signer).deploy();

  let comptroller;
  if (kind === 'bool') {
    // deploy comptroller bool type
    comptrollerLogic = await new BoolComptroller__factory(signer).deploy()
    comptroller = (await new ethers.Contract(unitroller.address, comptrollerLogic.interface)) as BoolComptroller
    // set implementation
    await unitroller._setPendingImplementation(comptrollerLogic.address)
    await unitroller._acceptImplementation()
    // return objects
    return {
      comptroller,
      comptrollerLogic,
      unitroller,
      oracle: priceOracle
    }
  }
  else {
    // deploy comptroller harness
    comptrollerLogic = await new ComptrollerHarness__factory(signer).deploy()
    comptroller = (await new ethers.Contract(unitroller.address, comptrollerLogic.interface)) as ComptrollerHarness
  }

  // set implementation
  await unitroller._setPendingImplementation(comptrollerLogic.address)
  await unitroller._acceptImplementation()

  await comptroller.connect(signer)._become(unitroller.address)

  const comp = await new Comp__factory(signer).deploy(signer.address)
  const closeFactor = opts?.closeFactor ?? ONE_18.mul(51).div(1000);
  // const maxAssets = BigNumber.from(10);
  const liquidationIncentive = etherMantissa(1);
  const compRate = opts?.compRate ?? ONE_18;
  // const compMarkets = opts.compMarkets || [];
  // const otherMarkets = opts.otherMarkets || [];

  // set parameters
  await comptroller.connect(signer).setCompAddress(comp.address)
  await comptroller.connect(signer)._setLiquidationIncentive(liquidationIncentive);
  await comptroller.connect(signer)._setCloseFactor(closeFactor);
  await comptroller.connect(signer).harnessSetCompRate(compRate)
  await comptroller.connect(signer)._setPriceOracle(priceOracle.address);

  return {
    unitroller,
    comptrollerLogic,
    comptroller,
    oracle: priceOracle
  }
}

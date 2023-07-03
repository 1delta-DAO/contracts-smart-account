import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat"
import {
  BoolComptroller,
  BoolComptroller__factory,
  CDaiDelegateHarness,
  CDaiDelegateHarness__factory,
  CDaiDelegateMakerHarness,
  CDaiDelegateMakerHarness__factory,
  CErc20DelegateHarness__factory,
  CErc20Delegator__factory,
  CErc20Harness,
  CErc20Harness__factory,
  CEther,
  CEtherHarness__factory,
  Comp,
  Comptroller,
  ComptrollerHarness, 
  ComptrollerHarness__factory, 
  Comp__factory, 
  CToken, 
  ERC20Harness, 
  ERC20Harness__factory, 
  FalseMarkerMethodInterestRateModel, 
  FalseMarkerMethodInterestRateModel__factory, 
  InterestRateModelHarness, 
  InterestRateModelHarness__factory, 
  JumpRateModel, 
  JumpRateModel__factory, 
  PriceOracle__factory, 
  SimplePriceOracle, 
  SimplePriceOracle__factory, 
  Unitroller, 
  Unitroller__factory, 
  WhitePaperInterestRateModel, 
  WhitePaperInterestRateModel__factory
    }
from "../../../types"
import ComptrollerHarnessArtifact from "../../../artifacts/contracts/external-protocols/compound/test/ComptrollerHarness.sol/ComptrollerHarness.json"
import UnitrollerArtifact from "../../../artifacts/contracts/external-protocols/compound/Unitroller.sol/Unitroller.json"

export const ONE_18 = ethers.BigNumber.from(10).pow(18)
export const ZERO = ethers.BigNumber.from(0)
export const ONE = ethers.BigNumber.from(1)


function encodeParameters(types :any, values:any[]) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
  }

export function etherMantissa(num:number| BigNumber, scale: number| BigNumber = ONE_18) {
    if (num < 0)
      return ethers. BigNumber.from(2).pow(256).add(num);
    return ethers. BigNumber.from(num).mul(scale);
  }

 export interface ComptrollerFixture {
    unitroller:Unitroller
    comptroller:ComptrollerHarness | BoolComptroller
    comptrollerLogic: ComptrollerHarness | BoolComptroller
    oracle:SimplePriceOracle
    // token1: TestERC20
    // token2: TestERC20
  }

  export function dfn(val:number|BigNumber, def:number) {
    return isFinite(val instanceof BigNumber ? val.toNumber(): val) ? val : def;
  }
  

interface ComptrollerOptions{
    root?:string
    kind?: string
    compRate?:BigNumber
    closeFactor?:BigNumber
}

export async function comptrollerFixture(
    signer:SignerWithAddress,
     opts:ComptrollerOptions ={compRate :ONE_18, closeFactor: ONE_18.mul(51).div(1000) }
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
    if(kind === 'bool'){
        // deploy comptroller bool type
        comptrollerLogic =await new  BoolComptroller__factory(signer).deploy()
        comptroller =( await new ethers.Contract(unitroller.address,comptrollerLogic.interface)) as BoolComptroller
        // set implementation
        await unitroller._setPendingImplementation(comptrollerLogic.address)
        await unitroller._acceptImplementation()
        // return objects
        return {
            comptroller,
            comptrollerLogic,
            unitroller,
            oracle:priceOracle 
        }
    }
    else{
        // deploy comptroller harness
        comptrollerLogic =await new  ComptrollerHarness__factory(signer).deploy()
        comptroller =( await new ethers.Contract(unitroller.address,comptrollerLogic.interface)) as ComptrollerHarness
    }

    // set implementation
    await unitroller._setPendingImplementation(comptrollerLogic.address)
    await unitroller._acceptImplementation()

    await comptroller.connect(signer)._become(unitroller.address)

    const comp = await new Comp__factory(signer).deploy(signer.address)
    const closeFactor = opts?.closeFactor ??  ONE_18.mul(51).div(1000);
    // const maxAssets = BigNumber.from(10);
    const liquidationIncentive = etherMantissa(1);
    const compRate = opts?.compRate ??  ONE_18;
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
         oracle:priceOracle 
        }
  }



export interface InterestRateModelOptons{
    kind?:string
    root?:string
    borrowRate?:BigNumber
    baseRate?:BigNumber
    multiplier?:BigNumber
    jump?:BigNumber
    kink?:BigNumber
}

  async function makeInterestRateModel(signer:SignerWithAddress ,opts:InterestRateModelOptons = {}) {
    const {
      root = signer.address,
      kind = 'harnessed'
    } = opts || {};
  
    if (kind == 'harnessed') {
      const borrowRate = opts?.borrowRate ?? ZERO;
      return await new InterestRateModelHarness__factory(signer).deploy(borrowRate)
    //   await deploy('InterestRateModelHarness', [borrowRate]);
    }
  
    if (kind == 'false-marker') {
    //   const borrowRate = opts?.borrowRate ?? ZERO;
      return await new FalseMarkerMethodInterestRateModel__factory(signer).deploy()
    //    await deploy('FalseMarkerMethodInterestRateModel', [borrowRate]);
    }
  
    if (kind == 'jump-rate') {
      const baseRate = opts?.baseRate?? 0
      const multiplier = opts?.multiplier?? ONE_18
      const jump = opts?.jump?? ZERO
      const kink = opts?.kink?? ZERO
      return await new JumpRateModel__factory(signer).deploy(baseRate, multiplier, jump, kink)
      // await deploy('JumpRateModel', [baseRate, multiplier, jump, kink]);
    }

    
        const baseRate = opts?.baseRate ?? ZERO;
        const multiplier = opts?.multiplier?? ONE;
        return await new WhitePaperInterestRateModel__factory(signer).deploy(baseRate, multiplier)
        //await deploy('WhitePaperInterestRateModel', [baseRate, multiplier]);
      
  }

export interface TokenOptions{
    kind?:string
    root?:string
    decimals?:number
    name?:string
    symbol?:string
    quantity?:BigNumber
}

  async function makeToken(signer:SignerWithAddress, opts:TokenOptions = {}):Promise<ERC20Harness> {
    const {
      root = signer.address,
      kind = 'erc20'
    } = opts || {};
  
    // if (kind == 'erc20') {
      const quantity = opts?.quantity ?? ONE_18.mul(1000000);
      const decimals = opts?.decimals ?? 18;
      const symbol = opts.symbol || 'OMG';
      const name = opts.name || `Erc20 ${symbol}`;
      return await new ERC20Harness__factory(signer).deploy(quantity, name, decimals, symbol) // deploy('ERC20Harness', [quantity, name, decimals, symbol]);
    // }
  }

  export interface CTokenOptions
  {
    kind:string
    root:string
    comptroller?:ComptrollerHarness | BoolComptroller
    comptrollerOpts?:ComptrollerOptions
    interestRateModel?:InterestRateModelHarness | FalseMarkerMethodInterestRateModel | WhitePaperInterestRateModel | JumpRateModel
    interestRateModelOpts?:InterestRateModelOptons
    exchangeRate?:BigNumber
    decimals?:number
    name?:string
    symbol?:string
    admin?: string
    compHolder?:string
    underlyingOpts?: TokenOptions
    underlying?:ERC20Harness
    supportMarket:boolean
      addCompMarket:boolean
      collateralFactor:BigNumber
      underlyingPrice?:BigNumber
     }

export interface CTokenFixture{
    cToken:CToken
    interestRateModel:InterestRateModelHarness | FalseMarkerMethodInterestRateModel | WhitePaperInterestRateModel | JumpRateModel
    comptroller:ComptrollerHarness | BoolComptroller
    underlying: CDaiDelegateMakerHarness | Comp | ERC20Harness | undefined
}
  export async function cTokenFixture(
    signer: SignerWithAddress, 
    opts:CTokenOptions = {kind:'cerc20', root:'', supportMarket:false, addCompMarket:false, collateralFactor:ONE_18}
    ):Promise<CTokenFixture> {
    const {
      root = opts.root ?? signer.address,
      kind = 'cerc20'
    } = opts || {};
  
    const comptroller = opts.comptroller || (await comptrollerFixture(signer, opts.comptrollerOpts)).comptroller;
    const interestRateModel = opts.interestRateModel || await makeInterestRateModel(signer, opts.interestRateModelOpts);
    const exchangeRate = opts?.exchangeRate ?? ONE;
    const decimals = opts?.decimals ??  8;
    const symbol = opts.symbol || (kind === 'cether' ? 'cETH' : 'cOMG');
    const name = opts?.name || `CToken ${symbol}`;
    const admin = opts?.admin || root;
  
    let cToken;
    let underlying:ERC20Harness | CDaiDelegateMakerHarness | Comp |undefined ;
    let cDelegator, cDelegatee, cDaiMaker;
  
    switch (kind) {
      case 'cether':
        cToken = await new CEtherHarness__factory(signer).deploy(
            comptroller.address,
            interestRateModel.address,
            exchangeRate,
            name,
            symbol,
            decimals,
            admin
          )
        break;
  
      case 'cdai':
        cDaiMaker  = await new CDaiDelegateMakerHarness__factory(signer).deploy() // deploy('CDaiDelegateMakerHarness');
        underlying = cDaiMaker;
        cDelegatee = await new CDaiDelegateHarness__factory(signer).deploy() // deploy('CDaiDelegateHarness');
        cDelegator = await new CErc20Delegator__factory(signer).deploy( // ) deploy('CErc20Delegator',
          
            underlying.address,
            comptroller.address,
            interestRateModel.address,
            exchangeRate,
            name,
            symbol,
            decimals,
            admin,
            cDelegatee.address,
            encodeParameters(['address', 'address'], [cDaiMaker.address, cDaiMaker.address])
          
        );
        cToken = await new ethers.Contract(cDelegator.address, CDaiDelegateHarness__factory.createInterface()) // saddle.getContractAt('CDaiDelegateHarness', cDelegator.address);
        break;
      
      case 'ccomp':
        underlying = await new Comp__factory(signer).deploy(opts.compHolder || root) // deploy('Comp', [opts.compHolder || root]);
        cDelegatee = await new CErc20DelegateHarness__factory(signer).deploy() // deploy('CErc20DelegateHarness');
        cDelegator = await new CErc20Delegator__factory(signer).deploy( //) deploy('CErc20Delegator',
          
            underlying.address,
            comptroller.address,
            interestRateModel.address,
            exchangeRate,
            name,
            symbol,
            decimals,
            admin,
            cDelegatee.address,
            Buffer.from("0x")
          
        );
        cToken = await new ethers.Contract(cDelegator.address, CErc20DelegateHarness__factory.createInterface()) // saddle.getContractAt('CErc20DelegateHarness', cDelegator.address);
        break;
  
      case 'cerc20':
      default:
        underlying = (opts?.underlying ?? await makeToken(signer, opts.underlyingOpts)) as ERC20Harness;
        cDelegatee = await new CErc20DelegateHarness__factory(signer).deploy() //  deploy('CErc20DelegateHarness');
        cDelegator = await new CErc20Delegator__factory(signer).deploy( //deploy('CErc20Delegator',
          
            underlying.address,
            comptroller.address,
            interestRateModel.address,
            exchangeRate,
            name,
            symbol,
            decimals,
            admin,
            cDelegatee.address,
            Buffer.from("0x")
          
        );
        cToken = await new ethers.Contract(cDelegator.address, CErc20DelegateHarness__factory.createInterface()) //saddle.getContractAt('CErc20DelegateHarness', cDelegator.address);
        break;
        
    }
  
    if (opts.supportMarket) {
      await (comptroller as ComptrollerHarness)._supportMarket(cToken.address);
    }
  
    if (opts.addCompMarket) {
        const unitroller = await new ethers.Contract(comptroller.address, Unitroller__factory.createInterface())
      await unitroller._addCompMarket(cToken.address);
    }
  
    if (opts?.underlyingPrice) {
      const price = etherMantissa(opts.underlyingPrice);
      const oracle = await new ethers.Contract(await (comptroller as ComptrollerHarness).oracle(), PriceOracle__factory.createInterface())
      await oracle.setUnderlyingPrice(cToken.address, price);
    }
  
    if (opts.collateralFactor) {
      const factor = etherMantissa(opts.collateralFactor);
      await (comptroller as ComptrollerHarness)._setCollateralFactor(cToken.address, factor)
    //   expect(await send(comptroller, '_setCollateralFactor', [cToken.address, factor])).toSucceed();
    }
  
    return{
        cToken: cToken as CToken,
        underlying,
        comptroller,
        interestRateModel
    } // Object.assign(cToken, { name, symbol, underlying, comptroller, interestRateModel });
  }

  async function preBorrow(cToken:CTokenFixture, borrower:string, borrowAmount:BigNumber) {
    await (cToken.comptroller as BoolComptroller).setBorrowAllowed(true)
    await (cToken.comptroller as BoolComptroller).setBorrowVerify(true)
    await (cToken.interestRateModel as InterestRateModelHarness).setFailBorrowRate(true)

    // await cToken.cToken.h(true)
    // await cToken.comptroller, 'setBorrowAllowed', [true]);
    // await cToken.comptroller, 'setBorrowVerify', [true]);
    // await cToken.interestRateModel, 'setFailBorrowRate', [false]);
    // await cToken., 'harnessSetBalance', [cToken.address, borrowAmount]);
    // await cToken, 'harnessSetFailTransferToAddress', [borrower, false]);
    // await cToken, 'harnessSetAccountBorrows', [borrower, 0, 0]);
    // await cToken, 'harnessSetTotalBorrows', [0]);
  }

  export interface CompoundFixture{
    cTokens:CErc20Harness[]
    cEther:CEther
    underlyings:ERC20Harness[]
    comptroller:ComptrollerHarness
    unitroller:Unitroller
    interestRateModels:(InterestRateModelHarness | FalseMarkerMethodInterestRateModel | WhitePaperInterestRateModel | JumpRateModel)[]
    cEthInterestRateModel:InterestRateModelHarness | FalseMarkerMethodInterestRateModel | WhitePaperInterestRateModel | JumpRateModel,
    priceOracle:SimplePriceOracle
  }
  
  export interface CompoundOptions{
    tokenCount:number
    collateralFactors:BigNumber[]
    exchangeRates:BigNumber[]
    borrowRates:BigNumber[]
    cEthExchangeRate:BigNumber
    cEthBorrowRate:BigNumber
    compRate?:BigNumber
    closeFactor?:BigNumber

  }

  export async function generateCompoundFixture(signer:SignerWithAddress, options:CompoundOptions):Promise<CompoundFixture> {

    console.log("Unitroller")
    // deploy unitroller
    const unitroller = await new Unitroller__factory(signer).deploy()

    // deploy oracle
    const priceOracle = await new SimplePriceOracle__factory(signer).deploy();



        // deploy comptroller harness
      const  comptrollerLogic =await new  ComptrollerHarness__factory(signer).deploy()
      console.log("Comptroller")
       const  comptroller =await ethers.getContractAt(
       [ ...ComptrollerHarnessArtifact.abi, ...UnitrollerArtifact.abi],
         unitroller.address) as ComptrollerHarness // ( await new ethers.Contract(unitroller.address,comptrollerLogic.interface)) as ComptrollerHarness
    

    // set implementation
    await unitroller._setPendingImplementation(comptrollerLogic.address)
    // await unitroller._acceptImplementation()

    await comptrollerLogic.connect(signer)._become(unitroller.address)
    console.log("Comp")
    const comp = await new Comp__factory(signer).deploy(signer.address)
    const closeFactor = options?.closeFactor ??  ONE_18.mul(51).div(1000);
    // const maxAssets = BigNumber.from(10);
    const liquidationIncentive = etherMantissa(1);
    const compRate = options?.compRate ??  ONE_18;
    // const compMarkets = options.compMarkets || [];
    // const otherMarkets = options.otherMarkets || [];

    // set parameters
    await comptroller.connect(signer).setCompAddress(comp.address)
    await comptroller.connect(signer)._setLiquidationIncentive(liquidationIncentive);
    await comptroller.connect(signer)._setCloseFactor(closeFactor);
    await comptroller.connect(signer).harnessSetCompRate(compRate)
    await comptroller.connect(signer)._setPriceOracle(priceOracle.address);

    const interestRateModelCETH= await new InterestRateModelHarness__factory(signer).deploy(options.cEthBorrowRate)

    console.log("CETH Args",     comptroller.address,
    interestRateModelCETH.address,
    options.cEthExchangeRate,
    'cEther',
    'CETH',
    18,
    signer.address
    )

    const c = await comptroller.connect(signer).isComptroller()
    console.log("C",c)
    const cEther =  await new CEtherHarness__factory(signer).deploy(
        comptroller.address,
        interestRateModelCETH.address,
        options.cEthExchangeRate,
        'cEther',
        'CETH',
        18,
        signer.address
      )
      console.log("CETH")
      let underlyings:ERC20Harness[]=[], cTokens:CErc20Harness[]=[], interestRateModels:InterestRateModelHarness[]=[];
      for(let i=0; i <options.collateralFactors.length; i++){
        const interestRateModel= await new InterestRateModelHarness__factory(signer).deploy(options.borrowRates[i])
        const quantity = ONE_18.mul(1000000);
        const decimals =  18;
        const symbol = 'OMG' + i;
        const name = `Erc20 ${i}`;
        const underlying  = await new ERC20Harness__factory(signer).deploy(quantity, name, decimals, symbol) 
        const cerc20Token = await new CErc20Harness__factory(signer).deploy(
            underlying.address,
            comptroller.address,
            interestRateModel.address,
            options.exchangeRates[i],
            name,
            symbol,
            decimals,
            signer.address
        );
        const cToken = cerc20Token
        cTokens.push(cToken)
        underlyings.push(underlying)
        interestRateModels.push(interestRateModel)

        // await comptroller.harnessAddCompMarkets([cToken.address]);

      const price = etherMantissa(options.exchangeRates[i]);
    //   const oracle = await new ethers.Contract(await (comptroller as ComptrollerHarness).oracle(), PriceOracle__factory.createInterface())
      await priceOracle.setUnderlyingPrice(cToken.address, price);
      console.log("Support", cToken.address)
      await comptroller._supportMarket(cToken.address)
      await comptroller.harnessAddCompMarkets([cToken.address]);
      await comptroller._setCollateralFactor(cToken.address, options.collateralFactors[i])
      }

      return{
        cEther,
        cTokens,
        comptroller,
        unitroller,
        underlyings,
        interestRateModels,
        cEthInterestRateModel:interestRateModelCETH,
        priceOracle
      }
  }
  
//   interface TokensFixture {
//     token0: TestERC20
//     token1: TestERC20
//     token2: TestERC20
//   }
  
//   async function tokensFixture(): Promise<TokensFixture> {
//     const tokenFactory = await ethers.getContractFactory('TestERC20')
//     const tokenA = (await tokenFactory.deploy(BigNumber.from(2).pow(255))) as TestERC20
//     const tokenB = (await tokenFactory.deploy(BigNumber.from(2).pow(255))) as TestERC20
//     const tokenC = (await tokenFactory.deploy(BigNumber.from(2).pow(255))) as TestERC20
  
//     const [token0, token1, token2] = [tokenA, tokenB, tokenC].sort((tokenA, tokenB) =>
//       tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? -1 : 1
//     )
  
//     return { token0, token1, token2 }
//   }
  
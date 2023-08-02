import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { solidityKeccak256 } from 'ethers/lib/utils'
import { UniswapV2Factory, UniswapV2Factory__factory, UniswapV2Pair__factory, UniswapV2Router02, UniswapV2Router02__factory } from '../../../types'

const overrides = {
  gasLimit: 9999999
}

export interface V2Fixture {
  factoryV2: UniswapV2Factory
  router02: UniswapV2Router02
}

export async function uniV2Fixture(signer: SignerWithAddress, weth:string): Promise<V2Fixture> {

  // deploy V2
  const factoryV2 = await new UniswapV2Factory__factory(signer).deploy(signer.address, overrides) 


  const COMPUTED_INIT_CODE_HASH = solidityKeccak256(['bytes'], [`${UniswapV2Pair__factory.bytecode}`])
  console.log(COMPUTED_INIT_CODE_HASH)
  // deploy routers
  const router02 = await new UniswapV2Router02__factory(signer).deploy(factoryV2.address, weth, overrides) 

  return {
    factoryV2,
    router02,
  }
}

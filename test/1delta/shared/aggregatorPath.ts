import { ethers } from "hardhat"
import { FeeAmount } from "../../uniswap-v3/periphery/shared/constants"

// token address, poolFee, poolId, tradeType
const typeSliceAggragator = ['address', 'uint24', 'uint8','uint8',]

export function encodeAggregtorPathEthers(path: string[], fees: FeeAmount[], flags: number[],pIds:number[], flag: number): string {
  if (path.length != fees.length + 1) {
    throw new Error('path/fee lengths do not match')
  }
  let types: string[] = []
  let data: string[] = []
  for (let i = 0; i < fees.length; i++) {
    const p = path[i]
    types = [...types, ...typeSliceAggragator]
    data = [...data, p, String(fees[i]), String(pIds[i]), String(flags[i])]
  }
  // add last address and flag
  types.push('address')
  types.push('uint8')
  
  data.push(path[path.length - 1])
  data.push(String(flag))

  // console.log(data)
  // console.log(types)

  return ethers.utils.solidityPack(types, data)
}
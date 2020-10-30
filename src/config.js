const chainDict = {
  WAN: "WAN",
  ETH: "ETH",
  ETC: "ETC",
  EOS: "EOS",
  TEST: "TEST"
};

const chainIndexDict = {
  WAN: 0x57414e,
  ETH: 0x3c,
  ETC: 0x3d,
  EOS: 0xc2,
};

const networkDict = {
  // WAN
  mainnet: {name:"mainnet", chainId: 1, chainType: chainDict.WAN, chainIndex:chainIndexDict.WAN},
  testnet: {name:"testnet", chainId: 3, chainType: chainDict.WAN, chainIndex:chainIndexDict.WAN},
  // ETH
  ethereum: {name:"ethereum", chainId: 1, chainType: chainDict.ETH, chainIndex:chainIndexDict.ETH},
  // ropsten: {name:"ropsten", chainId: 3, chainType: chainDict.ETH, chainIndex:chainIndexDict.ETH},
  rinkeby: {name:"rinkeby", chainId: 4,chainType: chainDict.ETH, chainIndex:chainIndexDict.ETH},
  // goerli: {name:"goerli", chainId: 6284, chainType: chainDict.ETH, chainIndex:chainIndexDict.ETH},
  // kovan: {name:"kovan", chainId: 42, chainType: chainDict.ETH, chainIndex:chainIndexDict.ETH},
}

const networks = Object.values(networkDict).map(v => v.name);

const defaultGas = {
    gasPrice: 10e9,
    gasLimit: 8e5
}

const defaultNodeUrlDict = {
  mainnet:  'http://gwan-mainnet.wandevs.org:26891', // http or wss
  testnet: 'http://gwan-testnet.wandevs.org:36891', // http or wss,
  ethereum: 'http://geth-mainnet.wandevs.org:26892', // http or wss,
  rinkeby: 'http://geth-testnet.wandevs.org:36892', // http or wss
}

const defaultHadrfork = "byzantium";

let defaultContractCfg = {};
Object.keys(networkDict).forEach(network => {
  defaultContractCfg[network] = {};
  defaultContractCfg[network].network = networkDict[network].name;
  defaultContractCfg[network].nodeURL = defaultNodeUrlDict[network];
  defaultContractCfg[network].hardfork = defaultHadrfork;
  defaultContractCfg[network].privateKey = '';
  defaultContractCfg[network].mnemonic = '';
  defaultContractCfg[network].index = 0;
  defaultContractCfg[network].gasPrice = defaultGas.gasPrice;
  defaultContractCfg[network].gasLimit = defaultGas.gasLimit;
});

module.exports = {
  chainDict,
  chainIndexDict,
  networkDict,
  networks,

  defaultGas,
  defaultNodeUrlDict,
  defaultContractCfg,
};

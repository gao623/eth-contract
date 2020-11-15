const bip39 = require('bip39');

const Web3 = require('web3');
const ethUtil = require('ethereumjs-util');
const ethCommon = require('ethereumjs-common').default;
const ethTx = require('ethereumjs-tx').Transaction
const wallet = require('ethereumjs-wallet');
const hdkey = wallet.hdkey;

const wanUtil = require('wanchain-util');
const wanTx = wanUtil.wanchainTx;

const {
  chainDict,
  chainIndexDict,
  networkDict,
  networks,
  defaultContractCfg,
} = require('./config');

class ContractWrapper {
  constructor(userCfg) {
    // update config
    this.cfg = Object.assign({}, defaultContractCfg.mainnet, userCfg);
    // init
    this.init();
  }

  init() {
    // init web3
    if (!this.cfg.nodeURL) {
      throw new Error("nodeURL is required");
    }
    if (this.cfg.nodeURL.indexOf('http:') == 0) {
      this.web3 = new Web3(new Web3.providers.HttpProvider(this.cfg.nodeURL));
    } else if (this.cfg.nodeURL.indexOf('wss:') == 0) {
      this.web3 = new Web3(new Web3.providers.WebsocketProvider(this.cfg.nodeURL));
    } else {
      throw new Error("invalid protocol, can only be http or wss");
    }

    if (!this.cfg.network || !networkDict[this.cfg.network]) {
      throw new Error(`invalid network, can only be in ${networks}`);
    }

    if (!this.cfg.privateKeys && !this.cfg.privateKey && (!this.cfg.mnemonic || Number.isNaN(Number(this.cfg.index)))) {
      throw new Error(`Need identify privateKey or (mnemonic and index)`);
    }

    if (this.cfg.privateKeys) {
      if (!Array.isArray(this.cfg.privateKeys)) {
        throw new Error(`Invalid privateKeys, should be Array`);
      }
      this.privateKeys = this.cfg.privateKeys.map(privateKey => this.parsePrivateKey(privateKey));
    } else  if (!this.cfg.privateKey && this.cfg.mnemonic) {
      this.privateKeys = [ContractWrapper.exportPrivateKey(this.cfg.mnemonic, Number(this.cfg.index))];
    } else {
      this.privateKeys = [this.parsePrivateKey(this.cfg.privateKey)];
    }
    // this.deployerAddress = this.privateKeyToAddress(this.privateKey);
    this.deployerAddresses = this.privateKeys.map(privateKey => this.privateKeyToAddress(privateKey));

    // this.chainType = this.cfg.chainType;
    this.chainType = networkDict[this.cfg.network].chainType;
  }

  parsePrivateKey(privateKey) {
    if (Buffer.isBuffer(privateKey)) {
      return privateKey;
    }
    if (typeof(privateKey) === "string") {
      if (privateKey.startsWith('0x')) {
        const pos = privateKey.indexOf('0x');
        privateKey = privateKey.slice(pos, privateKey.length);
      }
      if (privateKey && privateKey.length === 64){
        return Buffer.from(privateKey, 'hex');
      }
    }
    throw new Error("invalid private key");
  }

  privateKeyToAddress(privateKey) {
    if (!Buffer.isBuffer(privateKey)) {
      privateKey = Buffer.from(privateKey, "hex")
    }
    return ethUtil.bufferToHex(ethUtil.privateToAddress(privateKey));
  };

  contractAt(abi, address) {
    let contract = new this.web3.eth.Contract(abi, address);
    contract.address = contract._address;
    contract.abi = contract._jsonInterface;
    return contract;
  }

  async getChainId() {
    if (!this.chainId) {
      // this.chainId = await this.web3.eth.getChainId();
      this.chainId = networkDict[this.cfg.network].chainId;
    }

    return this.chainId;
  }

  getNonce(address) {
    return this.web3.eth.getTransactionCount(address, 'pending');
  }

  readContract(contract, func, ...args) {
    return new Promise((resolve, reject) => {
      try {
        let cb = (err, result) => {
          if (err) {
            return reject(err);
          }
          return resolve(result);
        };
        let options = {blockNumber:'latest'};
        let theLastOne = args.length - 1;
        if (args.length > 0 && !Array.isArray(args[theLastOne]) && typeof(args[theLastOne]) === "object") {
          let opt = args.pop();
          options = Object.assign({}, options, opt);
        }
        console.log("readContract", func, options, args)
        if (args.length) {
          return contract.methods[func](...args).call(options.blockNumber, cb);
        }
        return contract.methods[func]().call(options.blockNumber, cb);
      } catch (err) {
        return reject(err);
      }
    });
  }

  encodeTx(contract, func, ...args) {
    if (args.length) {
      return contract.methods[func](...args).encodeABI();
    }
    return contract.methods[func]().encodeABI();
  }

  async sendTx(contractAddr, data, options) {
    options = Object.assign({}, {value:0, privateKey: null, from: this.deployerAddresses[0]}, options);
    // console.log("sendTx, options", options);

    if (0 != data.indexOf('0x')){
      data = `0x${data}`;
    }

    let currPrivateKey;
    let currDeployerAddress;
    // if (options.privateKey && options.privateKey.toLowerCase() !== this.cfg.privateKey.toLowerCase()) {
    if (options.privateKey) {
      currPrivateKey = Buffer.from(options.privateKey, 'hex');
      currDeployerAddress = ContractWrapper.getAddressString(options.privateKey);
      // currDeployerAddress = '0x' + ethUtil.privateToAddress(options.privateKey).toString('hex').toLowerCase();
    } else if (options.from) {
      let id = this.deployerAddresses.findIndex(address => address.toLowerCase() === options.from.toLowerCase());
      currPrivateKey = this.privateKeys[id] || this.privateKeys[0];
      currDeployerAddress = this.deployerAddresses[id] || this.deployerAddresses[0];
    } else {
      currPrivateKey = this.privateKeys[0];
      currDeployerAddress = this.deployerAddresses[0];
    }

    let value = this.web3.utils.toWei(options.value.toString(), 'ether');
    value = new this.web3.utils.BN(value);
    value = `0x${value.toString(16)}`;

    let rawTx = {
      chainId: await this.getChainId(),
      to: contractAddr,
      nonce: await this.getNonce(currDeployerAddress),
      gasPrice: this.cfg.gasPrice,
      gasLimit: this.cfg.gasLimit,
      value: value,
      data: data
    };
    // console.log(this.chainType, "rawTx: ", rawTx);

    let tx
    if (this.chainType === chainDict.ETH) {
      let chainParams = {
        name: networkDict.mainnet.name,
        chainId: networkDict[this.cfg.network].chainId,
        url: this.cfg.nodeURL,
      };
      if (this.cfg.network !== networkDict.ethereum.name) {
        options.name = networkDict[this.cfg.network].name;
      }
      const customCommon = ethCommon.forCustomChain(chainParams.name, chainParams, this.cfg.hardfork);

      tx = new ethTx(rawTx, {common: customCommon});
    } else {
      rawTx.Txtype = 0x01;
      tx = new wanTx(rawTx);
    }
    tx.sign(currPrivateKey);
    // console.log("getSenderAddress", tx.getSenderAddress().toString('hex'))
    // console.log("signedTx: %O", tx);

    // try {
      let receipt = await this.web3.eth.sendSignedTransaction('0x' + tx.serialize().toString('hex'));
      return receipt;
    // } catch(err) {
    //   console.error("sendTx to contract %s error: %O", contractAddr, err);
    //   return null;
    // }
  }

  static exportPrivateKey(mnemonic, chainIdx = chainIndexDict.WAN, pos = 0) {
    const seed = bip39.mnemonicToSeedSync(mnemonic); // mnemonic is the string containing the words
    const hdk = hdkey.fromMasterSeed(seed);
    // const addr_node = hdk.derivePath(`m/44'/60'/0'/0/${pos}`); //m/44'/60'/0'/0/0 is derivation path for the first account. m/44'/60'/0'/0/1 is the derivation path for the second account and so on
    const addr_node = hdk.derivePath(`m/44'/${chainIdx}'/0'/0/${pos}`); //m/44'/60'/0'/0/0 is derivation path for the first account. m/44'/60'/0'/0/1 is the derivation path for the second account and so on
    // const addr = addr_node.getWallet().getAddressString(); //check that this is the same with the address that ganache list for the first account to make sure the derivation is correct
    // console.log("index to Address", addr)
    // const private_key = addr_node.getWallet().getPrivateKey().toString("hex");
    const private_key = addr_node.getWallet().getPrivateKey();
    return private_key;
  }

  static exportHDAddress(mnemonic, chainIdx = chainIndexDict.WAN, pos = 0) {
    const seed = bip39.mnemonicToSeedSync(mnemonic); // mnemonic is the string containing the words
    const hdk = hdkey.fromMasterSeed(seed);
    // const addr_node = hdk.derivePath(`m/44'/60'/0'/0/${pos}`); //m/44'/60'/0'/0/0 is derivation path for the first account. m/44'/60'/0'/0/1 is the derivation path for the second account and so on
    const addr_node = hdk.derivePath(`m/44'/${chainIdx}'/0'/0/${pos}`); //m/44'/60'/0'/0/0 is derivation path for the first account. m/44'/60'/0'/0/1 is the derivation path for the second account and so on
    const addr = addr_node.getWallet().getAddressString(); //check that this is the same with the address that ganache list for the first account to make sure the derivation is correct
    // console.log("index to Address", addr)
    // const private_key = addr_node.getWallet().getPrivateKey().toString("hex");
    const private_key = addr_node.getWallet().getPrivateKey();
    return {
      address: addr,
      privateKey:private_key
    };
  }

  static getAddressString(privateKey) {
    if (!Buffer.isBuffer(privateKey)) {
      privateKey = Buffer.from(privateKey, "hex")
    }
    return ethUtil.bufferToHex(ethUtil.privateToAddress(privateKey));
  };

  static getChainIndex(chainType) {
    chainType = chainType && chainType.toUpperCase();
    return chainIndexDict[chainType];
  }

}

module.exports = ContractWrapper;

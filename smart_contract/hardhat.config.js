const path = require("path");
// Hỗ trợ .env trong evm/ hoặc thư mục gốc repo (DATN/.env)
require("dotenv").config({path: path.join(__dirname, ".env")});
require("dotenv").config({path: path.join(__dirname, "..", ".env")});
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
          viaIR: true,   // needed for PollFactory (stack too deep fix)
        },
      },
    ],
    overrides: {
      // Poseidon library is a math-heavy vendored file:
      // viaIR makes it larger (29 KB → over limit), so compile it separately without viaIR.
      "contracts/merkle/PoseidonT3_Vendor.sol": {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
          viaIR: false,
        },
      },
    },
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  // Một API key dạng string → Hardhat dùng Etherscan API V2 (api.etherscan.io/v2/api + chainid).
  // Dạng { sepolia: "..." } bị coi là V1 và đã bị Etherscan từ chối → lỗi "deprecated V1 endpoint".
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io",
        },
      },
    ],
  },
  gasReporter: {
    enabled: true,
    outputFile: "gas-report.txt",
    noColors: true,
    reportPureStatements: true,
  },
  contractSizer: {
    alphaSort: false,
    disambiguatePaths: false,
    runOnCompile: false,
    strict: false,
  },
};

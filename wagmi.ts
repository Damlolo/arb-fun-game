import { createConfig, http } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    injected(),
    // Add WalletConnect project ID from https://cloud.walletconnect.com
    // walletConnect({ projectId: "YOUR_PROJECT_ID" }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
});

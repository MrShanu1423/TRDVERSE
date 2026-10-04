import { persist } from "./store";
import { sessions } from "../routes/auth";
import { accts } from "../routes/ledger";
import { users } from "../routes/wallet";
import { pending } from "../routes/pay";
import { pendingOrders } from "../routes/pending-orders";
import { watchlists, alerts } from "../routes/watchlist";
import { sips } from "../routes/funds";
import { positions } from "../routes/earn";
import { ads as p2pAds, trades as p2pTrades } from "../routes/p2p";
import { positions as futuresPositions } from "../routes/futures";

// Collection name -> in-memory Map that is saved to Firestore (see lib/store.ts)
persist("sessions", sessions);                                   // login sessions (key = sha256 of token)
persist("accounts", accts);                                      // paper-trading balance, holdings, orders
persist("wallet", users, (u) => ({ ...u, otp: new Map() }));     // wallet balances, address book, transfers (OTPs are never stored)
persist("payments", pending);                                    // pending Razorpay QR payments
persist("pending_orders", pendingOrders);                        // resting limit/stop paper orders
persist("watchlists", watchlists);                                // starred symbols per user
persist("alerts", alerts);                                        // price alerts
persist("sips", sips);                                            // mutual fund SIP records
persist("stake_positions", positions);                            // Earn/staking positions
persist("p2p_ads", p2pAds);                                        // P2P sell ads (holds escrowed crypto)
persist("p2p_trades", p2pTrades);                                  // P2P completed trades
persist("futures_positions", futuresPositions);                    // paper leveraged positions

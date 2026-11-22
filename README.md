# The Other Side

Run a market making desk in a fictional stock called ARCL. You choose the price you will pay to buy and the price you will accept to sell. A rival dealer competes for every order. After the close, you can find out who traded and replay one decision against the same market.

[Open the private simulator](https://the-other-side-quant-desk.dang-family-1930.chatgpt.site)

## Play a first round

1. Open **Trading desk**. The chart already contains five simulated minutes of opening history. Your desk starts flat, with no shares and zero profit.
2. Click **Next order** to handle one customer at a time, or **Start round** to run the clock. A full round has 60 arrivals, five simulated seconds apart.
3. The **half spread** sets the distance on either side of the reference price. For a $100.00 reference, a four cent half spread and zero shift post a $99.96 bid and a $100.04 ask. The **price shift** moves both prices together. Click **Post quote** to apply your settings to the next customer.
4. Watch **inventory**. A customer buying from you reduces the shares you hold. A customer selling to you increases them. At **Run to close**, the desk uses your current instructions for every remaining order.
5. Select **Review round**, choose an order, and change a quote. The replay shows the actual fill, the alternative fill, and the difference in profit at the close. The browser keeps your current session and five completed rounds on that device.

## Experiment with a rule

Open **Strategy lab**. Adjust your inventory weight, which controls how far to lower your prices as you acquire more shares. Use **Run tournament** to compare your rule with Fixed spread, Inventory guard, and Flow reader across up to 1,000 identical seeded scenarios per dealer. A seed is a number that reproduces the same sequence of market events. Each strategy faces its own copy of the same rival.

You can also open **Edit price shift formula** and write an expression. For example, the following lowers both prices by five cents when the desk holds more than 200 shares:

```python
-5 if inventory > 200 else 0
```

**Apply formula** saves it. **Use rule at desk** activates it for the next order. **Download Python** exports a complete callback with your settings.

The formula editor accepts numbers, parentheses, basic arithmetic, single comparisons, the conditional expression above, and the functions `abs`, `min`, and `max`. The available variables are `inventory`, `flow`, `risk_weight`, `flow_weight`, `step`, `remaining`, `reference`, `rival_bid`, `rival_ask`, and `profit`. Prices and profit are cents. Flow is the average direction of the six preceding customer orders, from −1 for all sells to +1 for all buys. A zero divisor or nonfinite result produces a neutral shift for that order. The final shift is rounded and capped at ±20 cents.

## Run the site on your computer

In GitHub, choose **Code**, then **Download ZIP**, and unzip the project. In VS Code, open the folder containing this README, then select **Terminal** and **New Terminal**. With Python 3 installed, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open [the local trading desk](http://127.0.0.1:8000/). Keep the terminal open while using this local copy. Press Control+C in the terminal to stop it. The hosted version runs independently of your computer.

## Run your own Python strategy

The local research runner supports ordinary Python, including functions and state across orders. It uses the same exchange as the web app. Install Python 3.9 or newer and Node.js 20 or newer. No additional packages are needed.

Run the included example from the project folder:

```sh
python3 research/tournament.py research/example_strategy.py --rounds 100 --seed 41726
```

To run your own, save the Python file downloaded from the lab in the project folder as `my_strategy.py`. Then run:

```sh
python3 research/tournament.py my_strategy.py --rounds 1000 --seed 41726
```

Implement `quote(market)` and return the three settings as integers.

```python
def quote(market):
    tilt = -5 if market["inventory"] > 200 else 0
    return {"half": 4, "tilt": tilt, "size": 100}
```

| Key | Meaning | Allowed values |
| --- | --- | --- |
| `half` | Half spread in cents | 1 to 20 |
| `tilt` | Shift of both prices in cents | −20 to 20 |
| `size` | Maximum shares on either side for one order | 1 to 500 |

The callback receives `step` (0 to 59), `remaining` (including the incoming order), `reference`, `rivalBid`, `rivalAsk`, `inventory`, `pnl`, and `flow`. The runner reloads the strategy at the start of each round so module variables begin fresh. Use `--json` to return full statistics with monetary values in cents.

## Market model

* A customer can have an immediate need to trade, a large fund order being split into smaller orders, or a noisy private valuation. Each arrives with a maximum buy price or minimum sale price. The rival posts a two sided quote before each arrival.
* Orders fill at the best eligible dealer price. A seeded tie break chooses the first dealer when prices match. Your displayed size refreshes on each order and is reduced when a fill would exceed the 1,000 share position limit. The rival can take any eligible remainder.
* Fees are one cent per share bought or sold. Profit equals cash plus inventory multiplied by the latest public reference. At the close, the underlying simulated value becomes public and is used to value the final inventory. There is no automatic liquidation trade.
* A replay overrides only the selected order. All subsequent instructions are reapplied. An inventory sensitive rule can therefore quote differently later. The simulated customers, private clues, rival quotes, and underlying path remain fixed.
* Fill rate is your executed share volume divided by all requested shares. High inventory means the desk reached at least 800 shares in either direction during a round. Drawdown measures the fall from a previous peak in marked profit.
* The exchange models competing quotes per customer. It has one rival, no price impact from your executions, no borrowing costs, and no latency. Use the results to study the mechanics of this model.

## Source and checks

| Location | Purpose |
| --- | --- |
| `dist/engine.mjs` | Market generation, routing, ledger, replay, risk measures |
| `dist/formula.mjs` | Formula parser and Python export |
| `dist/app.mjs`, `chart.mjs`, `replay.mjs`, `lab.mjs` in `dist/` | Browser interface and session management |
| `dist/tournament.mjs` | Background tournament worker |
| `research/` | Native Python callback and the shared exchange bridge |
| `tests/engine.test.mjs` | Accounting, routing, 1,000 round invariant checks, and Python parity |

Run `npm test` from the project folder. The tests use the Node.js standard library and invoke Python for the parity check. The web app is the static `dist/` directory and requires no build step, accounts, market data feeds, or broker credentials to run locally.

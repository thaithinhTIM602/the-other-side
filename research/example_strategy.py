from math import floor, isfinite


def quote(market):
    """Return half spread and price shift in cents, and size in shares."""
    risk_weight = 2
    flow_weight = 1
    inventory = market["inventory"]
    flow = market["flow"]
    step = market["step"]
    remaining = market["remaining"]
    reference = market["reference"]
    profit = market["pnl"]
    rival_bid = market["rivalBid"]
    rival_ask = market["rivalAsk"]
    try:
        shift = (-risk_weight * inventory / 100 + flow_weight * flow)
        tilt = floor(shift + 0.5) if isfinite(shift) else 0
    except (ZeroDivisionError, OverflowError):
        tilt = 0
    return {"half": 4, "tilt": max(-20, min(20, tilt)), "size": 100}

#!/usr/bin/env python3
"""
BME688 Environmental Monitor for M.O.U.S.E Ground Control Station
Reads environmental data and performs AI-based gas classification
Can be called from the GCS via API for single reads or streaming mode
"""

import time
import sys
import json
import argparse
from datetime import datetime
from collections import deque

try:
    import numpy as np
except ImportError:
    np = None

SENSOR_AVAILABLE = False

try:
    import board
    import busio
    import adafruit_bme680
    SENSOR_AVAILABLE = True
except ImportError:
    pass
except Exception:
    pass

# Configuration
I2C_ADDRESS = 0x76
SEA_LEVEL_PRESSURE = 1013.25
BASELINE_SAMPLES = 40

# Data buffers for AI analysis
gas_baseline = deque(maxlen=BASELINE_SAMPLES)
gas_history = deque(maxlen=10)

bme = None

SETUP_ERROR = None

def setup_sensor():
    """Initialize BME688 sensor"""
    global bme, SETUP_ERROR
    if not SENSOR_AVAILABLE:
        SETUP_ERROR = "Adafruit libraries not installed (board, busio, adafruit_bme680)"
        return False
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        bme = adafruit_bme680.Adafruit_BME680_I2C(i2c, address=I2C_ADDRESS)
        bme.sea_level_pressure = SEA_LEVEL_PRESSURE
        return True
    except PermissionError as e:
        SETUP_ERROR = f"Permission denied accessing I2C. Run: sudo usermod -a -G i2c $USER and reboot"
        return False
    except Exception as e:
        SETUP_ERROR = str(e)
        return False

def estimate_iaq(gas_ohms, humidity):
    """Calculate Indoor Air Quality score (0-500, lower is better)"""
    gas_score = min(max((gas_ohms / 100000) * 100, 0), 100)
    humidity_score = max(0, 100 - abs(humidity - 40) * 2)
    iaq = 500 - (gas_score * 2.5 + humidity_score * 2)
    return max(0, min(500, iaq))

def classify_gases(gas_ohms, temp_c, humidity):
    """
    AI-based gas classification using resistance patterns.
    BME688 gas resistance varies with different gas types:
    - High resistance (>100kOhm): Clean air
    - Medium (20-100kOhm): VOCs present
    - Low (<20kOhm): Strong reducing gases (H2, CO, ethanol)
    """
    if len(gas_baseline) < BASELINE_SAMPLES:
        gas_baseline.append(gas_ohms)
        return {
            'voc_ppm': 0, 'vsc_ppb': 0, 'co2_ppm': 400,
            'h2_ppm': 0, 'co_ppm': 0, 'ethanol_ppm': 0
        }
    
    if np:
        baseline = np.median(list(gas_baseline))
    else:
        sorted_baseline = sorted(gas_baseline)
        n = len(sorted_baseline)
        baseline = sorted_baseline[n // 2] if n % 2 else (sorted_baseline[n // 2 - 1] + sorted_baseline[n // 2]) / 2
    
    resistance_ratio = gas_ohms / baseline if baseline > 0 else 1
    gas_history.append(gas_ohms)
    
    estimates = {}
    
    # VOC (Volatile Organic Compounds)
    if resistance_ratio < 0.9:
        voc_factor = (1 - resistance_ratio) * 100
        estimates['voc_ppm'] = min(voc_factor * 0.5, 10.0)
    else:
        estimates['voc_ppm'] = 0
    
    # VSC (Volatile Sulfur Compounds)
    if len(gas_history) >= 3:
        recent_change = (gas_history[-1] - gas_history[-3]) / gas_history[-3] if gas_history[-3] > 0 else 0
        if recent_change < -0.15:
            estimates['vsc_ppb'] = min(abs(recent_change) * 1000, 500)
        else:
            estimates['vsc_ppb'] = 0
    else:
        estimates['vsc_ppb'] = 0
    
    # CO2 estimation
    humidity_factor = max(0, (humidity - 40) / 60)
    if resistance_ratio < 0.95:
        estimates['co2_ppm'] = 400 + (1 - resistance_ratio) * 2000 + humidity_factor * 500
    else:
        estimates['co2_ppm'] = 400
    
    # H2 (Hydrogen)
    if resistance_ratio < 0.5:
        estimates['h2_ppm'] = (1 - resistance_ratio) * 100
    else:
        estimates['h2_ppm'] = 0
    
    # CO (Carbon Monoxide)
    temp_compensation = 1 + (temp_c - 25) * 0.01
    if resistance_ratio < 0.7:
        estimates['co_ppm'] = max(0, (1 - resistance_ratio) * 50 * temp_compensation)
    else:
        estimates['co_ppm'] = 0
    
    # Ethanol
    if resistance_ratio < 0.6:
        estimates['ethanol_ppm'] = (1 - resistance_ratio) * 200
    else:
        estimates['ethanol_ppm'] = 0
    
    return estimates

def assess_health_risk(gas_est):
    """
    Assess health risk based on detected gas levels
    Returns: (risk_level, risk_description)
    """
    risks = []
    
    # VOC thresholds
    if gas_est['voc_ppm'] > 5.0:
        risks.append("HIGH VOC")
    elif gas_est['voc_ppm'] > 2.0:
        risks.append("MODERATE VOC")
    
    # CO thresholds - VERY DANGEROUS
    if gas_est['co_ppm'] > 50:
        return ("CRITICAL", "DANGEROUS CO LEVELS - EVACUATE!")
    elif gas_est['co_ppm'] > 9:
        return ("HIGH", "Elevated CO detected - Ventilate immediately")
    elif gas_est['co_ppm'] > 3:
        risks.append("Low CO detected")
    
    # CO2 thresholds
    if gas_est['co2_ppm'] > 2000:
        risks.append("HIGH CO2")
    elif gas_est['co2_ppm'] > 1000:
        risks.append("Elevated CO2")
    
    # H2 thresholds
    if gas_est['h2_ppm'] > 10:
        risks.append("H2 detected")
    
    # VSC thresholds
    if gas_est['vsc_ppb'] > 100:
        risks.append("Strong odors")
    
    if len(risks) >= 3 or any("HIGH" in r for r in risks):
        return ("HIGH", " | ".join(risks))
    elif len(risks) > 0:
        return ("MODERATE", " | ".join(risks))
    else:
        return ("GOOD", "Air quality good")

def read_sensor():
    """Read current sensor data and return as dict"""
    if bme is None:
        return None
    
    try:
        temp_c = bme.temperature
        temp_f = temp_c * 9 / 5 + 32
        humidity = bme.humidity
        pressure = bme.pressure
        gas_ohms = bme.gas
        altitude = bme.altitude
        
        iaq = estimate_iaq(gas_ohms, humidity)
        gas_est = classify_gases(gas_ohms, temp_c, humidity)
        risk_level, risk_desc = assess_health_risk(gas_est)
        
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "tempC": round(temp_c, 2),
            "tempF": round(temp_f, 2),
            "humidity": round(humidity, 2),
            "pressure": round(pressure, 2),
            "gasOhms": gas_ohms,
            "altitude": round(altitude, 2),
            "iaqScore": round(iaq, 1),
            "vocPpm": round(gas_est['voc_ppm'], 3),
            "vscPpb": round(gas_est['vsc_ppb'], 1),
            "co2Ppm": round(gas_est['co2_ppm'], 1),
            "h2Ppm": round(gas_est['h2_ppm'], 3),
            "coPpm": round(gas_est['co_ppm'], 3),
            "ethanolPpm": round(gas_est['ethanol_ppm'], 3),
            "healthRisk": risk_level,
            "healthRiskDesc": risk_desc
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def generate_simulated_data():
    """Generate simulated sensor data for testing"""
    import random
    
    temp_c = 22 + random.uniform(-3, 3)
    temp_f = temp_c * 9 / 5 + 32
    humidity = 45 + random.uniform(-10, 10)
    pressure = 1013.25 + random.uniform(-5, 5)
    gas_ohms = 80000 + random.uniform(-20000, 20000)
    altitude = 100 + random.uniform(-5, 5)
    
    iaq = 50 + random.uniform(0, 100)
    voc = random.uniform(0, 1.5)
    vsc = random.uniform(0, 50)
    co2 = 400 + random.uniform(0, 200)
    
    return {
        "success": True,
        "simulated": True,
        "timestamp": datetime.now().isoformat(),
        "tempC": round(temp_c, 2),
        "tempF": round(temp_f, 2),
        "humidity": round(humidity, 2),
        "pressure": round(pressure, 2),
        "gasOhms": int(gas_ohms),
        "altitude": round(altitude, 2),
        "iaqScore": round(iaq, 1),
        "vocPpm": round(voc, 3),
        "vscPpb": round(vsc, 1),
        "co2Ppm": round(co2, 1),
        "h2Ppm": 0,
        "coPpm": 0,
        "ethanolPpm": 0,
        "healthRisk": "GOOD",
        "healthRiskDesc": "Air quality good (simulated)"
    }

def main():
    parser = argparse.ArgumentParser(description='BME688 Environmental Monitor')
    parser.add_argument('action', choices=['read', 'stream', 'status'],
                       help='Action to perform')
    parser.add_argument('--interval', type=float, default=2.0,
                       help='Stream interval in seconds (default: 2.0)')
    parser.add_argument('--json', action='store_true',
                       help='Output in JSON format')
    parser.add_argument('--simulate', action='store_true',
                       help='Use simulated data if sensor not available')
    
    args = parser.parse_args()
    
    sensor_ready = setup_sensor()
    
    if args.action == 'status':
        result = {
            "success": True,
            "sensorAvailable": sensor_ready,
            "libraryAvailable": SENSOR_AVAILABLE,
            "i2cAddress": hex(I2C_ADDRESS),
            "baselineSamples": BASELINE_SAMPLES,
            "message": "BME688 sensor ready" if sensor_ready else "Sensor not available (simulated mode)"
        }
        print(json.dumps(result))
        return
    
    if args.action == 'read':
        if sensor_ready:
            data = read_sensor()
        elif args.simulate:
            data = generate_simulated_data()
        else:
            error_msg = SETUP_ERROR if SETUP_ERROR else "Sensor not available"
            data = {"success": False, "error": error_msg}
        
        print(json.dumps(data))
        return
    
    if args.action == 'stream':
        try:
            while True:
                if sensor_ready:
                    data = read_sensor()
                elif args.simulate:
                    data = generate_simulated_data()
                else:
                    data = {"success": False, "error": "Sensor not available"}
                
                print(json.dumps(data), flush=True)
                time.sleep(args.interval)
        except KeyboardInterrupt:
            pass
        return

if __name__ == "__main__":
    main()

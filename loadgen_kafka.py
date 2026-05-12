# loadgen_kafka.py
import time, json, argparse, random, csv
from kafka import KafkaProducer

def now_ms(): return int(time.time()*1000)

def pick(l): return random.choice(l)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--bootstrap", default="kafka:9093")
    ap.add_argument("--topic", default="iot.input")
    ap.add_argument("--room", default="CR-101")
    ap.add_argument("--device", default="L-1")
    ap.add_argument("--eps", type=float, default=5.0)
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--scenario", default="baseline")
    ap.add_argument("--noise", action="store_true", help="inject synthetic noise")
    args=ap.parse_args()

    p=KafkaProducer(bootstrap_servers=args.bootstrap,
                    value_serializer=lambda v: json.dumps(v).encode())

    interval=1.0/args.eps
    end=time.time()+args.seconds
    seq=0

    with open("input_log.csv","w",newline="") as f_in:
        w_in=csv.writer(f_in)
        w_in.writerow(["ts","roomId","deviceId","seq","scenarioId","temp","motion","co2","lux"])
        while time.time()<end:
            t0=time.time(); seq+=1; ts=now_ms()
            # 目标：R16（motion=true 且 lux<200 时触发），否则不触发
            want_fire = (seq % 2 == 0)           # 一半触发
            if args.noise and random.random()<random.uniform(0.1,0.3):
                want_fire = not want_fire        # 注入噪声：翻转一次期望

            motion = True if want_fire else pick([False, True])
            lux    = pick([120,150,180]) if want_fire else pick([300,450,600])

            msg={"roomId":args.room,"deviceId":args.device,"ts":ts,
                 "temp":25.0,"motion":motion,"co2":800,"lux":lux,
                 "seq":seq,"scenarioId":args.scenario}
            p.send(args.topic, msg)
            w_in.writerow([ts,args.room,args.device,seq,args.scenario,25.0,motion,800,lux])

            sleep=interval-(time.time()-t0)
            if sleep>0: time.sleep(sleep)

    p.flush(); p.close()

if __name__=="__main__":
    main()

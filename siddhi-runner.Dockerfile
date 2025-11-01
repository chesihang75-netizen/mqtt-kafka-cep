FROM siddhiio/siddhi-runner-alpine:latest

ARG SIDDHI_IO_KAFKA_VER=5.0.16
ARG KAFKA_CLIENTS_BUNDLE_VER=2.8.1_1   # ServiceMix 的 OSGi 版，导出 org.apache.kafka.clients.*
ARG PROTOBUF_VER=3.21.12
ARG LZ4_VER=1.8.0
ARG SNAPPY_VER=1.1.10.5
ARG ZSTD_VER=1.5.5-11

USER root
WORKDIR /home/siddhi_user

# 1) 删除内置旧版 siddhi-io-kafka，避免冲突
RUN rm -f \
  /home/siddhi_user/siddhi-runner/lib/siddhi-io-kafka-*.jar \
  /home/siddhi_user/siddhi-runner/_lib/siddhi-io-kafka-*.jar || true

# 2) 准备所有可能被 OSGi 扫描的 bundle 目录，并把“两个 OSGi bundle”都放进去
#    重点：/home/.../wso2/lib/plugins （这个目录你的镜像里存在，必须放）
RUN set -eux; \
  mkdir -p \
    /home/siddhi_user/siddhi-runner/wso2/lib/plugins \
    /home/siddhi_user/siddhi-runner/wso2/runner/dropins \
    /home/siddhi_user/siddhi-runner/dropins; \
  for D in \
    /home/siddhi_user/siddhi-runner/wso2/lib/plugins \
    /home/siddhi_user/siddhi-runner/wso2/runner/dropins \
    /home/siddhi_user/siddhi-runner/dropins \
  ; do \
    cd "$D"; \
    wget -q "https://repo1.maven.org/maven2/io/siddhi/extension/io/kafka/siddhi-io-kafka/${SIDDHI_IO_KAFKA_VER}/siddhi-io-kafka-${SIDDHI_IO_KAFKA_VER}.jar"; \
    wget -q "https://repo1.maven.org/maven2/org/apache/servicemix/bundles/org.apache.servicemix.bundles.kafka-clients/${KAFKA_CLIENTS_BUNDLE_VER}/org.apache.servicemix.bundles.kafka-clients-${KAFKA_CLIENTS_BUNDLE_VER}.jar"; \
  done

# 3) 非 OSGi 依赖放类路径（供运行时使用）
RUN set -eux; \
  cd /home/siddhi_user/siddhi-runner/lib; \
  wget -q "https://repo1.maven.org/maven2/com/google/protobuf/protobuf-java/${PROTOBUF_VER}/protobuf-java-${PROTOBUF_VER}.jar"; \
  wget -q "https://repo1.maven.org/maven2/org/lz4/lz4-java/${LZ4_VER}/lz4-java-${LZ4_VER}.jar"; \
  wget -q "https://repo1.maven.org/maven2/org/xerial/snappy/snappy-java/${SNAPPY_VER}/snappy-java-${SNAPPY_VER}.jar"; \
  wget -q "https://repo1.maven.org/maven2/com/github/luben/zstd-jni/${ZSTD_VER}/zstd-jni-${ZSTD_VER}.jar"; \
  cp -f *.jar /home/siddhi_user/siddhi-runner/_lib/

# 4) 权限
RUN chown -R 1001:1001 /home/siddhi_user
USER 1001

CMD ["/home/siddhi_user/siddhi-runner/bin/runner.sh"]

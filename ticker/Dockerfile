FROM python:3.11-slim
WORKDIR /app
RUN pip install kafka-python
COPY app.py /app/app.py
CMD ["python","/app/app.py"]

Here is a **clean, ready-to-use Markdown documentation file (`ecs-microservices-project.md`)**, describing everything you built manually:
ECR → ECS → Fargate → Secrets Manager → ALB → GitHub Actions CI/CD → Logging → Cleanup.

You can **copy & paste this directly into a `.md` file** for documentation or future Terraform planning.

---

# **Microservices Deployment on AWS ECS (Manual Workflow) — Documentation**

This document describes the **complete manual process** used to deploy a microservices application to **AWS ECS Fargate**, including ECR, ALB, Secrets Manager, IAM Roles, CloudWatch logs, GitHub Actions CI/CD, and cleanup procedures.

---

# 📌 **1. Architecture Overview**

Components used:

* **AWS ECR** → container registry
* **AWS ECS (Fargate)** → runs the microservices
* **ALB (Application Load Balancer)** → routes traffic to ECS tasks
* **ECS Task Definition** → container configuration
* **Secrets Manager** → stores database/password secrets
* **IAM Roles**

  * ecsTaskExecutionRole
  * ecsTaskRole
  * GitHub OIDC deploy role (optional)
* **CloudWatch Logs** → application logs
* **GitHub Actions CI/CD** → builds, tests, pushes, deploys
* **Prometheus + Grafana** (planned)

---

# 📌 **2. Sample Application Structure**

```
microservices/
  user-service/
    server.js
    package.json
    Dockerfile
  product-service/ (optional)
docker-compose.yml (optional for local testing)
```

---

# 📌 **3. Dockerfile Used for Deployment**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node","server.js"]
```

---

# 📌 **4. Create ECR Repository & Push Image**

### Create ECR repo:

```bash
aws ecr create-repository --repository-name user-service --region ap-south-1
```

### Authenticate Docker to ECR:

```bash
aws ecr get-login-password --region ap-south-1 | \
docker login --username AWS --password-stdin 569476542351.dkr.ecr.ap-south-1.amazonaws.com
```

### Build & Push Image:

```bash
docker build -t user-service .
docker tag user-service:latest 569476542351.dkr.ecr.ap-south-1.amazonaws.com/user-service:latest
docker push 569476542351.dkr.ecr.ap-south-1.amazonaws.com/user-service:latest
```

---

# 📌 **5. Create IAM Roles**

## **5.1 ecsTaskExecutionRole (pull images, write logs, read secrets)**

Trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ecs-tasks.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
```

Attach managed policy:

```bash
aws iam attach-role-policy \
 --role-name ecsTaskExecutionRole \
 --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

Allow reading secret:

```bash
aws iam put-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-name ecsSecretsAccess \
  --policy-document file://ecs-secrets-policy.json
```

## **5.2 ecsTaskRole (application-level permissions)**

Created identical trust policy, with added inline permissions if app needs AWS APIs.

---

# 📌 **6. Create Secrets Manager Secret**

```bash
aws secretsmanager create-secret \
  --name my-db-secret \
  --secret-string '{"password":"SuperSecret123"}' \
  --region ap-south-1
```

---

# 📌 **7. Create CloudWatch Log Group**

```bash
aws logs create-log-group \
  --log-group-name /ecs/user-service \
  --region ap-south-1
```

---

# 📌 **8. Create ALB & Target Group**

### Create Target Group

```bash
aws elbv2 create-target-group \
  --name user-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id <vpc-id> \
  --target-type ip \
  --region ap-south-1
```

### Create Load Balancer

```bash
aws elbv2 create-load-balancer \
  --name user-alb \
  --subnets subnet-1 subnet-2 \
  --security-groups sg-alb \
  --region ap-south-1
```

### Listener

```bash
aws elbv2 create-listener \
  --load-balancer-arn <alb-arn> \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=<tg-arn>
```

---

# 📌 **9. ECS Task Definition Template**

This template is rendered during CI/CD with the latest image.

```json
{
  "family": "user-service",
  "networkMode": "awsvpc",
  "executionRoleArn": "arn:aws:iam::569476542351:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::569476542351:role/ecsTaskRole",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "user",
      "image": "PLACEHOLDER_IMAGE",
      "portMappings": [{ "containerPort": 3000 }],
      "secrets": [{
        "name": "DB_PASSWORD",
        "valueFrom": "arn:aws:secretsmanager:ap-south-1:569476542351:secret:my-db-secret:password::"
      }],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/user-service",
          "awslogs-region": "ap-south-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

---

# 📌 **10. Create ECS Cluster**

```bash
aws ecs create-cluster --cluster-name microservices-cluster --region ap-south-1
```

---

# 📌 **11. Create ECS Service**

```bash
aws ecs create-service \
  --cluster microservices-cluster \
  --service-name user-service \
  --task-definition user-service \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-1,subnet-2],securityGroups=[sg-ecs],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=<tg-arn>,containerName=user,containerPort=3000" \
  --region ap-south-1
```

---

# 📌 **12. GitHub Actions CI/CD Pipeline**

### Workflow Summary

1. Checkout code
2. Run tests
3. Build Docker image
4. Push to ECR
5. Render task definition with new image
6. Register task definition revision
7. Update ECS service (rolling update)
8. Wait for stabilization
9. Smoke test via ALB health endpoint

---

# 📌 **13. Prometheus + Grafana (Planned Setup)**

### Prometheus steps:

* Add `/metrics` endpoint using `prom-client` in Node.js
* Deploy Prometheus as ECS service
* Configure `prometheus.yml` to scrape ECS tasks

### Grafana options:

* Self-hosted on ECS
* Or Amazon Managed Grafana

---

# 📌 **14. How to Test Deployment**

### Check service events:

```bash
aws ecs describe-services \
 --cluster microservices-cluster \
 --services user-service \
 --region ap-south-1 \
 --query "services[0].events"
```

### Check ALB health:

```bash
aws elbv2 describe-target-health --target-group-arn <tg-arn>
```

### Check HTTP health endpoint:

```bash
curl http://<alb-dns>/health
```

### Check logs:

```bash
aws logs describe-log-streams --log-group-name /ecs/user-service --region ap-south-1
```

---

# 📌 **15. Cleanup — Delete Everything**

Delete ECS service:

```bash
aws ecs update-service --cluster microservices-cluster --service user-service --desired-count 0 --region ap-south-1
aws ecs delete-service --cluster microservices-cluster --service user-service --force --region ap-south-1
```

Delete ECS cluster:

```bash
aws ecs delete-cluster --cluster microservices-cluster --region ap-south-1
```

Deregister task definitions:

```bash
aws ecs list-task-definitions --family-prefix user-service
aws ecs deregister-task-definition --task-definition user-service:1
```

Delete ALB:

```bash
aws elbv2 delete-load-balancer --load-balancer-arn <alb-arn> --region ap-south-1
```

Delete Target Group:

```bash
aws elbv2 delete-target-group --target-group-arn <tg-arn> --region ap-south-1
```

Delete ECR:

```bash
aws ecr delete-repository --repository-name user-service --force --region ap-south-1
```

Delete Secrets:

```bash
aws secretsmanager delete-secret \
 --secret-id my-db-secret \
 --force-delete-without-recovery \
 --region ap-south-1
```

Delete IAM roles:

```bash
aws iam delete-role-policy --role-name ecsTaskExecutionRole --policy-name ecsSecretsAccess
aws iam delete-role --role-name ecsTaskExecutionRole

aws iam delete-role-policy --role-name ecsTaskRole --policy-name ecsTaskRoleSecretsAccess
aws iam delete-role --role-name ecsTaskRole
```

---

# 📌 **16. Next Phase — Terraform Migration Plan**

Terraform modules you'll create:

* `vpc.tf`
* `alb.tf`
* `ecs-cluster.tf`
* `ecr.tf`
* `iam.tf`
* `secrets.tf`
* `cloudwatch.tf`
* `taskdefinition.tf` + taskdef template
* `service.tf`
* `variables.tf`
* `outputs.tf`

I can generate **ALL Terraform files** for you.

---

# 🎉 **Completed Manual Deployment — Ready for Terraform**

This document contains everything needed to repeat, automate, or rebuild the entire environment using Terraform.

---

If you'd like, I can now generate:

### ✔ Full Terraform code

### ✔ Terraform + GitHub Actions setup

### ✔ Terraform modules for multi-service architecture

### ✔ Prometheus & Grafana ECS deployment code

Just tell me:
👉 **“Generate full Terraform stack”**

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.26"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }
}

provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kubeconfig_context
}

provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kubeconfig_context
  }
}

locals {
  default_chart_path      = "${path.module}/../helm/nova-stack"
  rendered_extra_values   = [for p in var.extra_values : file(p)]
}

module "nova_stack" {
  source = "./modules/nova-stack"

  release_name    = var.release_name
  namespace       = var.namespace
  chart_path      = coalesce(var.chart_path, local.default_chart_path)
  image_registry  = var.image_registry
  image_tag       = var.image_tag
  extra_values    = local.rendered_extra_values
  create_namespace = var.create_namespace
}

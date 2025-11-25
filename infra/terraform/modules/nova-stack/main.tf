variable "release_name" {
  type        = string
  description = "Helm release name."
}

variable "namespace" {
  type        = string
  description = "Namespace to deploy into."
}

variable "chart_path" {
  type        = string
  description = "Path to the nova-stack Helm chart."
}

variable "image_registry" {
  type        = string
  description = "Optional override for global.imageRegistry."
  default     = null
}

variable "image_tag" {
  type        = string
  description = "Optional override for global.imageTag."
  default     = null
}

variable "extra_values" {
  type        = list(string)
  description = "Additional YAML values to pass to the chart."
  default     = []
}

variable "create_namespace" {
  type        = bool
  description = "Whether to create the namespace automatically."
  default     = true
}

resource "helm_release" "nova_stack" {
  name             = var.release_name
  namespace        = var.namespace
  create_namespace = var.create_namespace
  chart            = var.chart_path
  dependency_update = false

  dynamic "set" {
    for_each = var.image_registry == null ? [] : [var.image_registry]
    content {
      name  = "global.imageRegistry"
      value = set.value
    }
  }

  dynamic "set" {
    for_each = var.image_tag == null ? [] : [var.image_tag]
    content {
      name  = "global.imageTag"
      value = set.value
    }
  }

  values = var.extra_values
}

output "release_name" {
  value       = helm_release.nova_stack.name
  description = "Helm release name."
}

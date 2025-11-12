import { Application } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';



const definition =
{
  "openapi": "3.0.0",
  "info": {
    "title": "Family Wedding Manager API",
    "version": "1.0.0",
    "description": "Comprehensive API documentation for Family Wedding Manager - A collaborative wedding planning platform",
    "contact": {
      "name": "API Support",
      "email": "support@weddingmanager.com"
    }
  },
  "servers": [
    {
      "url": "http://localhost:5000/api/v1",
      "description": "Development server"
    },
    {
      "url": "https://api.weddingmanager.com/api/v1",
      "description": "Production server"
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    },
    "schemas": {
      "Error": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "example": "error"
          },
          "message": {
            "type": "string"
          },
          "errors": {
            "type": "array",
            "items": {
              "type": "object"
            }
          }
        }
      },
      "Success": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "example": "success"
          },
          "message": {
            "type": "string"
          },
          "data": {
            "type": "object"
          }
        }
      }
    }
  },
  "paths": {
    "/auth/send-otp": {
      "post": {
        "tags": ["Authentication"],
        "summary": "Send OTP to phone number",
        "description": "Sends a 6-digit OTP to the provided phone number for authentication",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["phoneNumber"],
                "properties": {
                  "phoneNumber": {
                    "type": "string",
                    "example": "1234567890",
                    "pattern": "^[0-9]{10,15}$"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OTP sent successfully",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Success"
                }
              }
            }
          },
          "400": {
            "description": "Validation error"
          },
          "429": {
            "description": "Too many requests"
          }
        }
      }
    },
    "/auth/verify-otp": {
      "post": {
        "tags": ["Authentication"],
        "summary": "Verify OTP and login/register",
        "description": "Verifies the OTP and returns JWT tokens",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["phoneNumber", "otp"],
                "properties": {
                  "phoneNumber": {
                    "type": "string",
                    "example": "1234567890"
                  },
                  "otp": {
                    "type": "string",
                    "example": "123456",
                    "minLength": 6,
                    "maxLength": 6
                  },
                  "fullName": {
                    "type": "string",
                    "example": "John Doe"
                  },
                  "email": {
                    "type": "string",
                    "example": "john@example.com"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "OTP verified successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": {
                      "type": "string",
                      "example": "success"
                    },
                    "data": {
                      "type": "object",
                      "properties": {
                        "token": {
                          "type": "string"
                        },
                        "refreshToken": {
                          "type": "string"
                        },
                        "user": {
                          "type": "object"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          "400": {
            "description": "Invalid OTP or validation error"
          }
        }
      }
    },
    "/auth/refresh-token": {
      "post": {
        "tags": ["Authentication"],
        "summary": "Refresh JWT token",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["refreshToken"],
                "properties": {
                  "refreshToken": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Token refreshed successfully"
          },
          "401": {
            "description": "Invalid refresh token"
          }
        }
      }
    },
    "/auth/logout": {
      "post": {
        "tags": ["Authentication"],
        "summary": "Logout user",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "responses": {
          "200": {
            "description": "Logged out successfully"
          }
        }
      }
    },
    "/weddings": {
      "post": {
        "tags": ["Weddings"],
        "summary": "Create a new wedding",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["brideName", "groomName", "weddingDate", "location", "totalBudget"],
                "properties": {
                  "brideName": {
                    "type": "string",
                    "example": "Jane Smith"
                  },
                  "groomName": {
                    "type": "string",
                    "example": "John Doe"
                  },
                  "weddingDate": {
                    "type": "string",
                    "format": "date-time",
                    "example": "2024-12-31T18:00:00Z"
                  },
                  "location": {
                    "type": "string",
                    "example": "Grand Hotel, New York"
                  },
                  "totalBudget": {
                    "type": "number",
                    "example": 50000
                  },
                  "currency": {
                    "type": "string",
                    "enum": ["INR", "USD", "EUR", "GBP"],
                    "example": "USD"
                  },
                  "description": {
                    "type": "string",
                    "example": "A beautiful winter wedding"
                  },
                  "imageUrl": {
                    "type": "string",
                    "example": "https://example.com/image.jpg"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Wedding created successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      },
      "get": {
        "tags": ["Weddings"],
        "summary": "Get all user's weddings",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 20
            }
          },
          {
            "name": "status",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["planning", "ongoing", "completed"]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of weddings fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/weddings/{weddingId}": {
      "get": {
        "tags": ["Weddings"],
        "summary": "Get wedding details",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Wedding details fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden - No access to this wedding"
          },
          "404": {
            "description": "Wedding not found"
          }
        }
      },
      "put": {
        "tags": ["Weddings"],
        "summary": "Update wedding",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "brideName": {
                    "type": "string"
                  },
                  "groomName": {
                    "type": "string"
                  },
                  "weddingDate": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "location": {
                    "type": "string"
                  },
                  "totalBudget": {
                    "type": "number"
                  },
                  "currency": {
                    "type": "string",
                    "enum": ["INR", "USD", "EUR", "GBP"]
                  },
                  "status": {
                    "type": "string",
                    "enum": ["planning", "ongoing", "completed"]
                  },
                  "description": {
                    "type": "string"
                  },
                  "imageUrl": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Wedding updated successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden - Insufficient permissions"
          },
          "404": {
            "description": "Wedding not found"
          }
        }
      },
      "delete": {
        "tags": ["Weddings"],
        "summary": "Delete wedding",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Wedding deleted successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden - Only admin can delete"
          },
          "404": {
            "description": "Wedding not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/join": {
      "post": {
        "tags": ["Weddings"],
        "summary": "Join wedding with code",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["weddingCode"],
                "properties": {
                  "weddingCode": {
                    "type": "string",
                    "example": "ABC123",
                    "minLength": 6,
                    "maxLength": 6
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Successfully joined the wedding"
          },
          "400": {
            "description": "Invalid code or already a member"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Wedding not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/stats": {
      "get": {
        "tags": ["Weddings"],
        "summary": "Get wedding statistics",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Wedding statistics fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Wedding not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/guests": {
      "post": {
        "tags": ["Guests"],
        "summary": "Add a new guest",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["firstName", "lastName", "category"],
                "properties": {
                  "firstName": {
                    "type": "string",
                    "example": "John"
                  },
                  "lastName": {
                    "type": "string",
                    "example": "Smith"
                  },
                  "email": {
                    "type": "string",
                    "example": "john.smith@example.com"
                  },
                  "phoneNumber": {
                    "type": "string",
                    "example": "1234567890"
                  },
                  "category": {
                    "type": "string",
                    "enum": ["family", "friends", "colleagues", "others"],
                    "example": "friends"
                  },
                  "plusOne": {
                    "type": "number",
                    "example": 1
                  },
                  "rsvpStatus": {
                    "type": "string",
                    "enum": ["pending", "confirmed", "declined"],
                    "example": "pending"
                  },
                  "dietaryRestrictions": {
                    "type": "string",
                    "example": "Vegetarian"
                  },
                  "seatingPreference": {
                    "type": "string",
                    "example": "Table 5"
                  },
                  "notes": {
                    "type": "string",
                    "example": "Prefers window seat"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Guest added successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden - Insufficient permissions"
          }
        }
      },
      "get": {
        "tags": ["Guests"],
        "summary": "Get all guests",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50
            }
          },
          {
            "name": "category",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["family", "friends", "colleagues", "others"]
            }
          },
          {
            "name": "rsvpStatus",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["pending", "confirmed", "declined"]
            }
          },
          {
            "name": "search",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of guests fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/weddings/{weddingId}/guests/{guestId}": {
      "put": {
        "tags": ["Guests"],
        "summary": "Update guest",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "guestId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "firstName": {
                    "type": "string"
                  },
                  "lastName": {
                    "type": "string"
                  },
                  "email": {
                    "type": "string"
                  },
                  "phoneNumber": {
                    "type": "string"
                  },
                  "category": {
                    "type": "string",
                    "enum": ["family", "friends", "colleagues", "others"]
                  },
                  "plusOne": {
                    "type": "number"
                  },
                  "rsvpStatus": {
                    "type": "string",
                    "enum": ["pending", "confirmed", "declined"]
                  },
                  "dietaryRestrictions": {
                    "type": "string"
                  },
                  "seatingPreference": {
                    "type": "string"
                  },
                  "notes": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Guest updated successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Guest not found"
          }
        }
      },
      "delete": {
        "tags": ["Guests"],
        "summary": "Delete guest",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "guestId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Guest deleted successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Guest not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/guests/stats": {
      "get": {
        "tags": ["Guests"],
        "summary": "Get guest statistics",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Guest statistics fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/weddings/{weddingId}/tasks": {
      "post": {
        "tags": ["Tasks"],
        "summary": "Create a new task",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["title", "category"],
                "properties": {
                  "title": {
                    "type": "string",
                    "example": "Book photographer"
                  },
                  "description": {
                    "type": "string",
                    "example": "Find and book a wedding photographer"
                  },
                  "category": {
                    "type": "string",
                    "enum": ["decoration", "catering", "logistics", "invitations", "music", "photography", "others"],
                    "example": "photography"
                  },
                  "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"],
                    "example": "high"
                  },
                  "status": {
                    "type": "string",
                    "enum": ["pending", "in-progress", "completed", "cancelled"],
                    "example": "pending"
                  },
                  "dueDate": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "assignedTo": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  },
                  "estimatedHours": {
                    "type": "number",
                    "example": 5
                  },
                  "tags": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Task created successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      },
      "get": {
        "tags": ["Tasks"],
        "summary": "Get all tasks",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50
            }
          },
          {
            "name": "status",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["pending", "in-progress", "completed", "cancelled"]
            }
          },
          {
            "name": "priority",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["low", "medium", "high", "urgent"]
            }
          },
          {
            "name": "category",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["decoration", "catering", "logistics", "invitations", "music", "photography", "others"]
            }
          },
          {
            "name": "assignedTo",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of tasks fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/weddings/{weddingId}/tasks/{taskId}": {
      "put": {
        "tags": ["Tasks"],
        "summary": "Update task",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "title": {
                    "type": "string"
                  },
                  "description": {
                    "type": "string"
                  },
                  "category": {
                    "type": "string",
                    "enum": ["decoration", "catering", "logistics", "invitations", "music", "photography", "others"]
                  },
                  "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "urgent"]
                  },
                  "status": {
                    "type": "string",
                    "enum": ["pending", "in-progress", "completed", "cancelled"]
                  },
                  "dueDate": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "assignedTo": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  },
                  "estimatedHours": {
                    "type": "number"
                  },
                  "actualHours": {
                    "type": "number"
                  },
                  "tags": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Task updated successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Task not found"
          }
        }
      },
      "delete": {
        "tags": ["Tasks"],
        "summary": "Delete task",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Task deleted successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Task not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/tasks/{taskId}/assign": {
      "post": {
        "tags": ["Tasks"],
        "summary": "Assign task to users",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["assignedTo"],
                "properties": {
                  "assignedTo": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "example": ["userId1", "userId2"]
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Task assigned successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Task not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/tasks/{taskId}/complete": {
      "post": {
        "tags": ["Tasks"],
        "summary": "Mark task as complete",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "taskId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "actualHours": {
                    "type": "number",
                    "example": 8
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Task marked as completed"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Task not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/budget": {
      "post": {
        "tags": ["Budget"],
        "summary": "Add budget item",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["category", "description", "estimatedCost"],
                "properties": {
                  "category": {
                    "type": "string",
                    "enum": ["venue", "catering", "decoration", "photography", "music", "invitations", "logistics", "other"],
                    "example": "catering"
                  },
                  "description": {
                    "type": "string",
                    "example": "Wedding dinner catering"
                  },
                  "estimatedCost": {
                    "type": "number",
                    "example": 15000
                  },
                  "actualCost": {
                    "type": "number",
                    "example": 14500
                  },
                  "vendor": {
                    "type": "string",
                    "description": "Vendor ID"
                  },
                  "status": {
                    "type": "string",
                    "enum": ["estimated", "approved", "paid", "pending"],
                    "example": "approved"
                  },
                  "paymentDate": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "currency": {
                    "type": "string",
                    "example": "USD"
                  },
                  "notes": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Budget item added successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      },
      "get": {
        "tags": ["Budget"],
        "summary": "Get all budget items",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50
            }
          },
          {
            "name": "category",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["venue", "catering", "decoration", "photography", "music", "invitations", "logistics", "other"]
            }
          },
          {
            "name": "status",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["estimated", "approved", "paid", "pending"]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of budget items fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/weddings/{weddingId}/budget/{budgetId}": {
      "put": {
        "tags": ["Budget"],
        "summary": "Update budget item",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "budgetId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "category": {
                    "type": "string",
                    "enum": ["venue", "catering", "decoration", "photography", "music", "invitations", "logistics", "other"]
                  },
                  "description": {
                    "type": "string"
                  },
                  "estimatedCost": {
                    "type": "number"
                  },
                  "actualCost": {
                    "type": "number"
                  },
                  "vendor": {
                    "type": "string"
                  },
                  "status": {
                    "type": "string",
                    "enum": ["estimated", "approved", "paid", "pending"]
                  },
                  "paymentDate": {
                    "type": "string",
                    "format": "date-time"
                  },
                  "currency": {
                    "type": "string"
                  },
                  "notes": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Budget item updated successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Budget item not found"
          }
        }
      },
      "delete": {
        "tags": ["Budget"],
        "summary": "Delete budget item",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "budgetId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Budget item deleted successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Budget item not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/budget/analytics": {
      "get": {
        "tags": ["Budget"],
        "summary": "Get budget analytics",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Budget analytics fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/weddings/{weddingId}/vendors": {
      "post": {
        "tags": ["Vendors"],
        "summary": "Add vendor",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["vendorName", "category", "phoneNumber", "estimatedCost"],
                "properties": {
                  "vendorName": {
                    "type": "string",
                    "example": "Elite Caterers"
                  },
                  "category": {
                    "type": "string",
                    "enum": ["catering", "photography", "decoration", "music", "venue", "invitations", "logistics", "other"],
                    "example": "catering"
                  },
                  "contactPerson": {
                    "type": "string",
                    "example": "John Manager"
                  },
                  "email": {
                    "type": "string",
                    "example": "contact@elitecaterers.com"
                  },
                  "phoneNumber": {
                    "type": "string",
                    "example": "1234567890"
                  },
                  "website": {
                    "type": "string",
                    "example": "https://elitecaterers.com"
                  },
                  "estimatedCost": {
                    "type": "number",
                    "example": 20000
                  },
                  "actualCost": {
                    "type": "number"
                  },
                  "bookingStatus": {
                    "type": "string",
                    "enum": ["inquiry", "negotiating", "booked", "confirmed", "cancelled"],
                    "example": "inquiry"
                  },
                  "negotiationNotes": {
                    "type": "string"
                  },
                  "contractUrl": {
                    "type": "string"
                  },
                  "paymentTerms": {
                    "type": "string"
                  },
                  "rating": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 5
                  },
                  "reviews": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Vendor added successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      },
      "get": {
        "tags": ["Vendors"],
        "summary": "Get all vendors",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50
            }
          },
          {
            "name": "category",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["catering", "photography", "decoration", "music", "venue", "invitations", "logistics", "other"]
            }
          },
          {
            "name": "bookingStatus",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string",
              "enum": ["inquiry", "negotiating", "booked", "confirmed", "cancelled"]
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of vendors fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/weddings/{weddingId}/vendors/{vendorId}": {
      "put": {
        "tags": ["Vendors"],
        "summary": "Update vendor",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "vendorId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "vendorName": {
                    "type": "string"
                  },
                  "category": {
                    "type": "string",
                    "enum": ["catering", "photography", "decoration", "music", "venue", "invitations", "logistics", "other"]
                  },
                  "contactPerson": {
                    "type": "string"
                  },
                  "email": {
                    "type": "string"
                  },
                  "phoneNumber": {
                    "type": "string"
                  },
                  "website": {
                    "type": "string"
                  },
                  "estimatedCost": {
                    "type": "number"
                  },
                  "actualCost": {
                    "type": "number"
                  },
                  "bookingStatus": {
                    "type": "string",
                    "enum": ["inquiry", "negotiating", "booked", "confirmed", "cancelled"]
                  },
                  "negotiationNotes": {
                    "type": "string"
                  },
                  "contractUrl": {
                    "type": "string"
                  },
                  "paymentTerms": {
                    "type": "string"
                  },
                  "rating": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 5
                  },
                  "reviews": {
                    "type": "string"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Vendor updated successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Vendor not found"
          }
        }
      },
      "delete": {
        "tags": ["Vendors"],
        "summary": "Delete vendor",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "vendorId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Vendor deleted successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Vendor not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/collaborators/invite": {
      "post": {
        "tags": ["Collaborators"],
        "summary": "Invite collaborator",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["phoneNumber"],
                "properties": {
                  "phoneNumber": {
                    "type": "string",
                    "example": "1234567890"
                  },
                  "role": {
                    "type": "string",
                    "enum": ["admin", "editor", "viewer"],
                    "example": "editor"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Collaborator invited successfully"
          },
          "400": {
            "description": "User not found or already a collaborator"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden - Only admin can invite"
          },
          "404": {
            "description": "User not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/collaborators": {
      "get": {
        "tags": ["Collaborators"],
        "summary": "Get all collaborators",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "List of collaborators fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/weddings/{weddingId}/collaborators/{collaboratorId}": {
      "put": {
        "tags": ["Collaborators"],
        "summary": "Update collaborator role",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "collaboratorId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "role": {
                    "type": "string",
                    "enum": ["admin", "editor", "viewer"]
                  },
                  "permissions": {
                    "type": "object",
                    "properties": {
                      "canEdit": {
                        "type": "boolean"
                      },
                      "canDelete": {
                        "type": "boolean"
                      },
                      "canInvite": {
                        "type": "boolean"
                      },
                      "canManageMembers": {
                        "type": "boolean"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Collaborator updated successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden - Only admin can update"
          },
          "404": {
            "description": "Collaborator not found"
          }
        }
      },
      "delete": {
        "tags": ["Collaborators"],
        "summary": "Remove collaborator",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "collaboratorId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Collaborator removed successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden - Only admin can remove"
          },
          "404": {
            "description": "Collaborator not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/activities": {
      "get": {
        "tags": ["Activities"],
        "summary": "Get activity feed",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Activity feed fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/notifications": {
      "get": {
        "tags": ["Notifications"],
        "summary": "Get all user notifications",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50
            }
          },
          {
            "name": "isRead",
            "in": "query",
            "required": false,
            "schema": {
              "type": "boolean"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Notifications fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/notifications/{notificationId}/read": {
      "put": {
        "tags": ["Notifications"],
        "summary": "Mark notification as read",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "notificationId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Notification marked as read"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Notification not found"
          }
        }
      }
    },
    "/notifications/{notificationId}": {
      "delete": {
        "tags": ["Notifications"],
        "summary": "Delete notification",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "notificationId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Notification deleted successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Notification not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/comments": {
      "post": {
        "tags": ["Comments"],
        "summary": "Add comment",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["entityType", "entityId", "content"],
                "properties": {
                  "entityType": {
                    "type": "string",
                    "enum": ["task", "guest", "budget", "vendor", "note"],
                    "example": "task"
                  },
                  "entityId": {
                    "type": "string",
                    "example": "64abc123def456789"
                  },
                  "content": {
                    "type": "string",
                    "example": "Great progress on this task!",
                    "maxLength": 1000
                  },
                  "attachments": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "url": {
                          "type": "string"
                        },
                        "fileName": {
                          "type": "string"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Comment added successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/{entityType}/{entityId}/comments": {
      "get": {
        "tags": ["Comments"],
        "summary": "Get comments for entity",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "entityType",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "enum": ["task", "guest", "budget", "vendor", "note"]
            }
          },
          {
            "name": "entityId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Comments fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          }
        }
      }
    },
    "/comments/{commentId}": {
      "put": {
        "tags": ["Comments"],
        "summary": "Edit comment",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "commentId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["content"],
                "properties": {
                  "content": {
                    "type": "string",
                    "maxLength": 1000
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Comment updated successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Comment not found or unauthorized"
          }
        }
      },
      "delete": {
        "tags": ["Comments"],
        "summary": "Delete comment",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "commentId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Comment deleted successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Comment not found or unauthorized"
          }
        }
      }
    },
    "/comments/{commentId}/like": {
      "post": {
        "tags": ["Comments"],
        "summary": "Like/Unlike comment",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "commentId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Comment liked/unliked successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "404": {
            "description": "Comment not found"
          }
        }
      }
    },
    "/weddings/{weddingId}/notes": {
      "post": {
        "tags": ["Shared Notes"],
        "summary": "Create shared note",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["title", "content"],
                "properties": {
                  "title": {
                    "type": "string",
                    "example": "Vendor Contact List"
                  },
                  "content": {
                    "type": "string",
                    "example": "List of all vendor contacts and requirements"
                  },
                  "tags": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "example": ["vendors", "contacts"]
                  },
                  "collaborators": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    },
                    "description": "Array of user IDs who can edit this note"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "201": {
            "description": "Note created successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      },
      "get": {
        "tags": ["Shared Notes"],
        "summary": "Get all notes",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "page",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 1
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": {
              "type": "integer",
              "default": 50
            }
          },
          {
            "name": "search",
            "in": "query",
            "required": false,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "tags",
            "in": "query",
            "required": false,
            "schema": {
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Notes fetched successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          }
        }
      }
    },
    "/weddings/{weddingId}/notes/{noteId}": {
      "put": {
        "tags": ["Shared Notes"],
        "summary": "Update note",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "noteId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "title": {
                    "type": "string"
                  },
                  "content": {
                    "type": "string"
                  },
                  "tags": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  },
                  "collaborators": {
                    "type": "array",
                    "items": {
                      "type": "string"
                    }
                  },
                  "isPinned": {
                    "type": "boolean"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Note updated successfully"
          },
          "400": {
            "description": "Validation error"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Note not found"
          }
        }
      },
      "delete": {
        "tags": ["Shared Notes"],
        "summary": "Delete note",
        "security": [
          {
            "bearerAuth": []
          }
        ],
        "parameters": [
          {
            "name": "weddingId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "noteId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Note deleted successfully"
          },
          "401": {
            "description": "Unauthorized"
          },
          "403": {
            "description": "Forbidden"
          },
          "404": {
            "description": "Note not found"
          }
        }
      }
    }
  },
  "tags": [
    {
      "name": "Authentication",
      "description": "User authentication and authorization endpoints"
    },
    {
      "name": "Weddings",
      "description": "Wedding management endpoints"
    },
    {
      "name": "Guests",
      "description": "Guest list management endpoints"
    },
    {
      "name": "Tasks",
      "description": "Task and todo management endpoints"
    },
    {
      "name": "Budget",
      "description": "Budget tracking and analytics endpoints"
    },
    {
      "name": "Vendors",
      "description": "Vendor management endpoints"
    },
    {
      "name": "Collaborators",
      "description": "Collaboration and team management endpoints"
    },
    {
      "name": "Activities",
      "description": "Activity feed and audit trail endpoints"
    },
    {
      "name": "Notifications",
      "description": "User notification management endpoints"
    },
    {
      "name": "Comments",
      "description": "Comments and discussion endpoints"
    },
    {
      "name": "Shared Notes",
      "description": "Collaborative note-taking endpoints"
    }
  ]
}

const options = {
  definition,
  apis: ['./src/routes/*.ts', './src/models/*.ts']
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Application): void => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => {
    console.log(req);

    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};
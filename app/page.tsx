"use client"

import type React from "react"

import { useRef, useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Square,
  Circle,
  MousePointer,
  Type,
  Pen,
  Mic,
  MicOff,
  Grid3X3,
  Layers,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Download,
  Share,
  ChevronDown,
  Users,
  Minus,
  Plus,
  Hand,
  Search,
  Bell,
  User,
  RotateCcw,
} from "lucide-react"

interface DrawingObject {
  id: string
  type: "rectangle" | "circle" | "line" | "text" | "freehand"
  x: number
  y: number
  width?: number
  height?: number
  radius?: number
  endX?: number
  endY?: number
  color: string
  strokeWidth: number
  text?: string
  fontSize?: number
  points?: { x: number; y: number }[]
  visible: boolean
  locked: boolean
  selected?: boolean
}

export default function ShoutFigma() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const animationRef = useRef<number>()

  const [selectedTool, setSelectedTool] = useState<"select" | "rectangle" | "circle" | "line" | "text" | "pen">(
    "select",
  )
  const [objects, setObjects] = useState<DrawingObject[]>([])
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isMicActive, setIsMicActive] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [meterLevel, setMeterLevel] = useState(0) // Voice meter that rises and falls
  const [currentColor, setCurrentColor] = useState("#3B82F6")
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [zoom, setZoom] = useState(100)
  const [showGrid, setShowGrid] = useState(true)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [textInput, setTextInput] = useState("")
  const [isAddingText, setIsAddingText] = useState(false)
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null)
  const [lastActiveColor, setLastActiveColor] = useState("#3B82F6") // Track last color when mic was active

  // Major colors that change based on voice level
  const majorColors = [
    "#3B82F6", // Blue
    "#22C55E", // Green
    "#EF4444", // Red
    "#A855F7", // Purple
    "#F97316", // Orange
    "#14B8A6", // Teal
    "#EC4899", // Pink
    "#F59E0B", // Yellow
  ]

  const colorNames = ["Blue", "Green", "Red", "Purple", "Orange", "Teal", "Pink", "Yellow"]

  // Get color from meter level (0-100) - cycles through major colors
  const getColorFromMeterLevel = useCallback((level: number) => {
    const colorIndex = Math.floor((level / 100) * (majorColors.length - 1))
    return majorColors[Math.min(colorIndex, majorColors.length - 1)]
  }, [])

  // Get color name for UI
  const getColorName = useCallback((level: number) => {
    const colorIndex = Math.floor((level / 100) * (colorNames.length - 1))
    return colorNames[Math.min(colorIndex, colorNames.length - 1)]
  }, [])

  // Audio processing with meter logic
  const processAudio = useCallback(() => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const currentLevel = Math.min(average * 1.2, 100)

    setAudioLevel(currentLevel)

    // Update meter level - rises quickly, falls gradually
    setMeterLevel((prevMeter) => {
      const newMeterLevel = currentLevel > prevMeter ? currentLevel : Math.max(prevMeter * 0.98, currentLevel)

      // Update color and last active color based on new meter level
      const newColor = getColorFromMeterLevel(newMeterLevel)
      setCurrentColor(newColor)
      setLastActiveColor(newColor)

      return newMeterLevel
    })

    animationRef.current = requestAnimationFrame(processAudio)
  }, [getColorFromMeterLevel])

  // Reset meter level
  const resetMeterLevel = () => {
    setMeterLevel(0)
    setLastActiveColor("#3B82F6") // Reset to initial blue
    setCurrentColor("#3B82F6")
  }

  // Start microphone
  const startMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream)

      analyserRef.current.fftSize = 256
      microphoneRef.current.connect(analyserRef.current)

      setIsMicActive(true)
      processAudio()
    } catch (error) {
      console.error("Microphone access denied:", error)
      alert("Microphone access is required for voice-controlled colors!")
    }
  }

  const stopMicrophone = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    if (microphoneRef.current) {
      microphoneRef.current.disconnect()
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    setIsMicActive(false)
    setAudioLevel(0)
    setMeterLevel(0)
    // Keep the last active color instead of resetting
    setCurrentColor(lastActiveColor)
  }

  // Canvas coordinate conversion
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  // Find object at coordinates
  const findObjectAtCoordinates = (x: number, y: number): DrawingObject | null => {
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i]
      if (!obj.visible) continue

      switch (obj.type) {
        case "rectangle":
          if (x >= obj.x && x <= obj.x + (obj.width || 0) && y >= obj.y && y <= obj.y + (obj.height || 0)) {
            return obj
          }
          break
        case "circle":
          const distance = Math.sqrt(Math.pow(x - obj.x, 2) + Math.pow(y - obj.y, 2))
          if (distance <= (obj.radius || 0)) {
            return obj
          }
          break
        case "freehand":
          if (obj.points) {
            for (const point of obj.points) {
              const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2))
              if (distance <= obj.strokeWidth + 5) {
                return obj
              }
            }
          }
          break
      }
    }
    return null
  }

  // Mouse event handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e)
    setDragStart(coords)
    setIsDrawing(true)

    if (selectedTool === "select") {
      const clickedObject = findObjectAtCoordinates(coords.x, coords.y)
      if (clickedObject && !clickedObject.locked) {
        setSelectedObjectId(clickedObject.id)
        setIsDragging(true)
        setDragOffset({
          x: coords.x - clickedObject.x,
          y: coords.y - clickedObject.y,
        })
      } else {
        setSelectedObjectId(null)
      }
    } else if (selectedTool === "text") {
      setTextPosition(coords)
      setIsAddingText(true)
    } else if (selectedTool === "pen") {
      setCurrentPath([coords])
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e)

    if (isDragging && selectedObjectId && dragOffset) {
      setObjects((prev) =>
        prev.map((obj) =>
          obj.id === selectedObjectId ? { ...obj, x: coords.x - dragOffset.x, y: coords.y - dragOffset.y } : obj,
        ),
      )
    } else if (isDrawing && selectedTool === "pen" && dragStart) {
      setCurrentPath((prev) => [...prev, coords])
    }
  }

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !dragStart) return

    const coords = getCanvasCoordinates(e)

    if (isDragging) {
      setIsDragging(false)
      setDragOffset(null)
    } else if (selectedTool !== "select" && selectedTool !== "text") {
      const newObject: DrawingObject = {
        id: Date.now().toString(),
        type: selectedTool,
        x: Math.min(dragStart.x, coords.x),
        y: Math.min(dragStart.y, coords.y),
        color: currentColor,
        strokeWidth: strokeWidth,
        visible: true,
        locked: false,
      }

      switch (selectedTool) {
        case "rectangle":
          newObject.width = Math.abs(coords.x - dragStart.x)
          newObject.height = Math.abs(coords.y - dragStart.y)
          break
        case "circle":
          const radius = Math.sqrt(Math.pow(coords.x - dragStart.x, 2) + Math.pow(coords.y - dragStart.y, 2))
          newObject.radius = radius
          newObject.x = dragStart.x
          newObject.y = dragStart.y
          break
        case "line":
          newObject.x = dragStart.x
          newObject.y = dragStart.y
          newObject.endX = coords.x
          newObject.endY = coords.y
          break
        case "pen":
          newObject.type = "freehand"
          newObject.points = currentPath
          break
      }

      if (newObject.width !== 0 || newObject.height !== 0 || newObject.radius !== 0 || newObject.points?.length) {
        setObjects((prev) => [...prev, newObject])
      }
    }

    setIsDrawing(false)
    setDragStart(null)
    setCurrentPath([])
  }

  // Text input handler
  const handleTextSubmit = () => {
    if (textInput.trim() && textPosition) {
      const newObject: DrawingObject = {
        id: Date.now().toString(),
        type: "text",
        x: textPosition.x,
        y: textPosition.y,
        color: currentColor,
        strokeWidth: strokeWidth,
        text: textInput,
        fontSize: 16,
        visible: true,
        locked: false,
      }
      setObjects((prev) => [...prev, newObject])
      setTextInput("")
      setIsAddingText(false)
      setTextPosition(null)
    }
  }

  // Layer management functions
  const toggleObjectVisibility = (id: string) => {
    setObjects((prev) => prev.map((obj) => (obj.id === id ? { ...obj, visible: !obj.visible } : obj)))
  }

  const toggleObjectLock = (id: string) => {
    setObjects((prev) => prev.map((obj) => (obj.id === id ? { ...obj, locked: !obj.locked } : obj)))
  }

  const deleteObject = (id: string) => {
    setObjects((prev) => prev.filter((obj) => obj.id !== id))
    if (selectedObjectId === id) {
      setSelectedObjectId(null)
    }
  }

  const deleteSelectedObject = () => {
    if (selectedObjectId) {
      deleteObject(selectedObjectId)
    }
  }

  const clearCanvas = () => {
    setObjects([])
    setSelectedObjectId(null)
  }

  const duplicateObject = (id: string) => {
    const obj = objects.find((o) => o.id === id)
    if (obj) {
      const newObj = { ...obj, id: Date.now().toString(), x: obj.x + 20, y: obj.y + 20 }
      setObjects((prev) => [...prev, newObj])
    }
  }

  // Canvas rendering
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw grid if enabled
    if (showGrid) {
      ctx.strokeStyle = "#E1E5E9"
      ctx.lineWidth = 0.5
      const gridSize = 8

      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }

      for (let y = 0; y <= canvas.height; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }
    }

    // Draw objects
    objects.forEach((obj) => {
      if (!obj.visible) return

      ctx.strokeStyle = obj.color
      ctx.fillStyle = obj.color + "20"
      ctx.lineWidth = obj.strokeWidth
      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      switch (obj.type) {
        case "rectangle":
          ctx.strokeRect(obj.x, obj.y, obj.width || 0, obj.height || 0)
          ctx.fillRect(obj.x, obj.y, obj.width || 0, obj.height || 0)
          break
        case "circle":
          ctx.beginPath()
          ctx.arc(obj.x, obj.y, obj.radius || 0, 0, 2 * Math.PI)
          ctx.stroke()
          ctx.fill()
          break
        case "line":
          ctx.beginPath()
          ctx.moveTo(obj.x, obj.y)
          ctx.lineTo(obj.endX || obj.x, obj.endY || obj.y)
          ctx.stroke()
          break
        case "text":
          ctx.fillStyle = obj.color
          ctx.font = `${obj.fontSize || 16}px Inter, system-ui, sans-serif`
          ctx.fillText(obj.text || "", obj.x, obj.y)
          break
        case "freehand":
          if (obj.points && obj.points.length > 1) {
            ctx.beginPath()
            ctx.moveTo(obj.points[0].x, obj.points[0].y)
            obj.points.forEach((point) => {
              ctx.lineTo(point.x, point.y)
            })
            ctx.stroke()
          }
          break
      }

      // Draw selection indicator
      if (obj.id === selectedObjectId) {
        ctx.strokeStyle = "#0D99FF"
        ctx.lineWidth = 1
        ctx.setLineDash([])

        switch (obj.type) {
          case "rectangle":
            ctx.strokeRect(obj.x - 1, obj.y - 1, (obj.width || 0) + 2, (obj.height || 0) + 2)
            // Selection handles
            const handles = [
              [obj.x - 3, obj.y - 3],
              [obj.x + (obj.width || 0) / 2 - 3, obj.y - 3],
              [obj.x + (obj.width || 0) + 3, obj.y - 3],
              [obj.x + (obj.width || 0) + 3, obj.y + (obj.height || 0) / 2 - 3],
              [obj.x + (obj.width || 0) + 3, obj.y + (obj.height || 0) + 3],
              [obj.x + (obj.width || 0) / 2 - 3, obj.y + (obj.height || 0) + 3],
              [obj.x - 3, obj.y + (obj.height || 0) + 3],
              [obj.x - 3, obj.y + (obj.height || 0) / 2 - 3],
            ]
            ctx.fillStyle = "#0D99FF"
            handles.forEach(([x, y]) => {
              ctx.fillRect(x, y, 6, 6)
            })
            break
          case "circle":
            ctx.beginPath()
            ctx.arc(obj.x, obj.y, (obj.radius || 0) + 1, 0, 2 * Math.PI)
            ctx.stroke()
            break
        }
      }
    })

    // Draw current path while drawing
    if (isDrawing && selectedTool === "pen" && currentPath.length > 1) {
      ctx.strokeStyle = currentColor
      ctx.lineWidth = strokeWidth
      ctx.beginPath()
      ctx.moveTo(currentPath[0].x, currentPath[0].y)
      currentPath.forEach((point) => {
        ctx.lineTo(point.x, point.y)
      })
      ctx.stroke()
    }
  }, [objects, showGrid, isDrawing, selectedTool, currentPath, currentColor, strokeWidth, selectedObjectId])

  useEffect(() => {
    renderCanvas()
  }, [renderCanvas])

  // Export canvas as image
  const exportCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement("a")
    link.download = "shout-figma-design.png"
    link.href = canvas.toDataURL()
    link.click()
  }

  useEffect(() => {
    return () => {
      stopMicrophone()
    }
  }, [])

  return (
    <div className="h-screen bg-[#2C2C2C] flex flex-col font-sans">
      {/* Figma Top Bar */}
      <div className="bg-[#2C2C2C] border-b border-[#3C3C3C] px-3 py-2 flex items-center justify-between text-white">
        <div className="flex items-center gap-4">
          {/* Figma Logo & File Name */}
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-gradient-to-br from-[#F24E1E] via-[#FF7262] to-[#A259FF] rounded-sm flex items-center justify-center">
              <span className="text-white font-bold text-xs">F</span>
            </div>
            <span className="text-sm font-medium">Shout-Figma</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>

          {/* Voice Control Indicator */}
          <div className="flex items-center gap-2 bg-[#3C3C3C] px-3 py-1.5 rounded-md">
            <Button
              onClick={isMicActive ? stopMicrophone : startMicrophone}
              size="sm"
              variant={isMicActive ? "destructive" : "default"}
              className="h-6 px-2 text-xs"
            >
              {isMicActive ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
            </Button>

            {/* Single Voice Meter with Major Colors */}
            <div className="flex flex-col gap-1">
              <div className="w-32 h-2 bg-[#4C4C4C] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-green-500 via-red-500 via-purple-500 via-orange-500 via-teal-500 via-pink-500 to-yellow-500 transition-all duration-100"
                  style={{ width: `${meterLevel}%` }}
                />
              </div>
            </div>

            <span className="text-xs text-gray-400 min-w-[30px]">{Math.round(meterLevel)}%</span>

            {/* Reset Button */}
            <Button
              onClick={resetMeterLevel}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-gray-400 hover:text-white"
              title="Reset meter"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Collaboration */}
          <div className="flex items-center gap-2">
            <Button size="sm" className="bg-[#0D99FF] hover:bg-[#0D99FF]/90 h-8 px-3 text-xs">
              <Share className="w-3 h-3 mr-1" />
              Share
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-[#3C3C3C] h-8 px-2">
              <Users className="w-4 h-4" />
            </Button>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-white hover:bg-[#3C3C3C] h-8 px-2">
              <Bell className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="text-white hover:bg-[#3C3C3C] h-8 px-2">
              <User className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Figma Toolbar */}
      <div className="bg-[#2C2C2C] border-b border-[#3C3C3C] px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {/* Tools */}
          <div className="flex items-center bg-[#3C3C3C] rounded-lg p-1">
            {[
              { tool: "select", icon: MousePointer, label: "Move" },
              { tool: "rectangle", icon: Square, label: "Rectangle" },
              { tool: "circle", icon: Circle, label: "Ellipse" },
              { tool: "pen", icon: Pen, label: "Pen" },
              { tool: "text", icon: Type, label: "Text" },
            ].map(({ tool, icon: Icon, label }) => (
              <Button
                key={tool}
                size="sm"
                variant="ghost"
                className={`w-8 h-8 p-0 rounded-md ${
                  selectedTool === tool
                    ? "bg-[#0D99FF] text-white hover:bg-[#0D99FF]/90"
                    : "text-gray-300 hover:bg-[#4C4C4C] hover:text-white"
                }`}
                onClick={() => setSelectedTool(tool as any)}
                title={label}
              >
                <Icon className="w-4 h-4" />
              </Button>
            ))}
          </div>

          <div className="w-px h-6 bg-[#3C3C3C] mx-2" />

          {/* Additional Tools */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className={`w-8 h-8 p-0 rounded-md ${
                showGrid
                  ? "bg-[#0D99FF] text-white hover:bg-[#0D99FF]/90"
                  : "text-gray-300 hover:bg-[#4C4C4C] hover:text-white"
              }`}
              onClick={() => setShowGrid(!showGrid)}
              title="Show Grid"
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-300 hover:bg-[#4C4C4C] hover:text-white w-8 h-8 p-0 rounded-md"
              title="Hand Tool"
            >
              <Hand className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Current Color */}
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded border border-[#4C4C4C] transition-colors duration-200"
              style={{ backgroundColor: currentColor }}
            />
            <div className="flex flex-col">
              <span className="text-xs text-gray-400 font-mono">{currentColor}</span>
              <span className="text-xs text-gray-500">{getColorName(meterLevel)}</span>
            </div>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-300 hover:bg-[#4C4C4C] hover:text-white w-8 h-8 p-0 rounded-md"
              onClick={() => setZoom(Math.max(25, zoom - 25))}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="text-xs text-gray-300 min-w-[40px] text-center">{zoom}%</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-300 hover:bg-[#4C4C4C] hover:text-white w-8 h-8 p-0 rounded-md"
              onClick={() => setZoom(Math.min(400, zoom + 25))}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Layers */}
        <div className="w-60 bg-[#2C2C2C] border-r border-[#3C3C3C] flex flex-col">
          {/* Layers Header */}
          <div className="p-3 border-b border-[#3C3C3C]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">Layers</h3>
              <span className="text-xs text-gray-400">({objects.length})</span>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search layers"
                className="w-full bg-[#3C3C3C] border border-[#4C4C4C] rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#0D99FF]"
              />
            </div>
          </div>

          {/* Layers List */}
          <div className="flex-1 overflow-y-auto">
            {objects.length === 0 ? (
              <div className="p-4 text-center text-gray-400">
                <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-xs">No layers yet</p>
                <p className="text-xs opacity-75">Start drawing to create layers</p>
              </div>
            ) : (
              <div className="p-2">
                {objects
                  .slice()
                  .reverse()
                  .map((obj, index) => (
                    <div
                      key={obj.id}
                      className={`group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                        selectedObjectId === obj.id
                          ? "bg-[#0D99FF]/20 border border-[#0D99FF]/50"
                          : "hover:bg-[#3C3C3C]"
                      }`}
                      onClick={() => setSelectedObjectId(obj.id)}
                    >
                      <div className="w-4 h-4 rounded border" style={{ backgroundColor: obj.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">
                          {obj.type === "freehand" ? "Drawing" : obj.type} {objects.length - index}
                        </div>
                        {obj.text && <div className="text-xs text-gray-400 truncate">"{obj.text}"</div>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-5 h-5 p-0 text-gray-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleObjectVisibility(obj.id)
                          }}
                        >
                          {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-5 h-5 p-0 text-gray-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleObjectLock(obj.id)
                          }}
                        >
                          {obj.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Canvas Area */}
        <div className="flex-1 bg-[#1E1E1E] relative overflow-hidden">
          {/* Canvas */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-2xl border border-[#3C3C3C] overflow-hidden">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="block cursor-crosshair"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center" }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={() => {
                  setIsDrawing(false)
                  setIsDragging(false)
                }}
              />
            </div>
          </div>

          {/* Voice Indicator */}
          <div className="absolute top-4 left-4 bg-black/80 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isMicActive ? "bg-red-500 animate-pulse" : "bg-gray-500"}`} />🎤{" "}
            {isMicActive
              ? `${getColorName(meterLevel)} color: ${Math.round(meterLevel)}%`
              : "Enable mic for voice colors"}
          </div>

          {/* Canvas Controls */}
          <div className="absolute bottom-4 left-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-[#2C2C2C] border-[#3C3C3C] text-white hover:bg-[#3C3C3C]"
              onClick={clearCanvas}
            >
              Clear All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-[#2C2C2C] border-[#3C3C3C] text-white hover:bg-[#3C3C3C]"
              onClick={resetMeterLevel}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Reset Meter
            </Button>
            {selectedObjectId && (
              <Button
                variant="outline"
                size="sm"
                className="bg-[#2C2C2C] border-[#3C3C3C] text-white hover:bg-[#3C3C3C]"
                onClick={deleteSelectedObject}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            )}
          </div>

          {/* Text Input Modal */}
          {isAddingText && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="bg-[#2C2C2C] border border-[#3C3C3C] p-6 rounded-lg shadow-xl">
                <h3 className="text-lg font-semibold mb-4 text-white">Add Text</h3>
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Enter your text..."
                  className="w-full p-2 bg-[#3C3C3C] border border-[#4C4C4C] rounded text-white placeholder-gray-400 mb-4 focus:outline-none focus:border-[#0D99FF]"
                  autoFocus
                  onKeyPress={(e) => e.key === "Enter" && handleTextSubmit()}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className="bg-[#0D99FF] hover:bg-[#0D99FF]/90"
                  >
                    Add Text
                  </Button>
                  <Button
                    variant="outline"
                    className="border-[#3C3C3C] text-white hover:bg-[#3C3C3C] bg-transparent"
                    onClick={() => {
                      setIsAddingText(false)
                      setTextInput("")
                      setTextPosition(null)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Properties */}
        <div className="w-60 bg-[#2C2C2C] border-l border-[#3C3C3C] flex flex-col">
          {/* Properties Header */}
          <div className="p-3 border-b border-[#3C3C3C]">
            <h3 className="text-sm font-medium text-white">Design</h3>
          </div>

          {/* Properties Content */}
          <div className="p-3 space-y-4">
            {/* Voice Meter & Current Color */}
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-2">Voice Color Meter</label>
              <div className="flex items-center gap-2 p-2 bg-[#3C3C3C] rounded-md">
                <div
                  className="w-8 h-8 rounded border border-[#4C4C4C] transition-colors duration-200"
                  style={{ backgroundColor: currentColor }}
                />
                <div className="flex-1">
                  <div className="text-xs font-mono text-white">{currentColor}</div>
                  <div className="text-xs text-gray-400">
                    {isMicActive ? `${getColorName(meterLevel)} color` : "Enable microphone"}
                  </div>
                </div>
              </div>

              {/* Single Progress Indicator */}
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Voice Level</span>
                  <span>{Math.round(meterLevel)}%</span>
                </div>
                <div className="w-full h-3 bg-[#3C3C3C] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-green-500 via-red-500 via-purple-500 via-orange-500 via-teal-500 via-pink-500 to-yellow-500 transition-all duration-100"
                    style={{ width: `${meterLevel}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 text-center">Louder voice = different colors</div>
              </div>
            </div>

            {/* Stroke */}
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-2">Stroke</label>
              <div className="space-y-2">
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="w-full h-1 bg-[#3C3C3C] rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>1</span>
                  <span className="font-medium text-white">{strokeWidth}</span>
                  <span>20</span>
                </div>
              </div>
            </div>

            {/* Export */}
            <div>
              <label className="text-xs font-medium text-gray-300 block mb-2">Export</label>
              <Button
                size="sm"
                className="w-full bg-[#3C3C3C] hover:bg-[#4C4C4C] text-white border border-[#4C4C4C]"
                onClick={exportCanvas}
              >
                <Download className="w-3 h-3 mr-2" />
                Export PNG
              </Button>
            </div>
          </div>

          {/* Voice Instructions */}
          <div className="mt-auto p-3 border-t border-[#3C3C3C] bg-[#1E1E1E]">
            <h4 className="text-xs font-medium text-white mb-2">🎤 Voice Color System</h4>
            <div className="space-y-1 text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Quiet → Blue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Louder → Green</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span>Loud → Red</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full" />
                <span>Very Loud → Purple</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                <span>Loudest → Yellow</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {isMicActive ? "🎨 Meter active! Shout for different colors!" : "Enable mic to start!"}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full mt-2 text-xs text-gray-400 hover:text-white"
              onClick={resetMeterLevel}
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Reset Meter
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

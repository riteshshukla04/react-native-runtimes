package com.nativecomposechat

import android.content.Context
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.runtime.Stable
import kotlin.math.abs
import kotlin.math.max

@Stable
class ComposeChatListItemView(context: Context) : FrameLayout(context) {
  private companion object {
    const val FABRIC_MOUNT_LOG_TAG = "FabricMount"
    const val FABRIC_HOST_LOG_TAG = "FabricHost"
    var nextCellInstanceId = 1
  }

  private val cellInstanceId = nextCellInstanceId++
  var itemIndex: Int = -1
    private set
  var itemId: String = ""
    private set
  var renderVersion: Int = 0
    private set
  var contentType: String = "default"
    private set
  var hostSlot: String = ""
    private set
  var messagePreview: String = ""
    private set
  var owner: ComposeChatListView? = null
  private var lastReportedHeight = 0
  private var preferredMeasuredHeightPx = 0

  init {
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
    clipChildren = true
    clipToPadding = true
  }

  fun setItemIndex(nextItemIndex: Int) {
    if (itemIndex == nextItemIndex) return
    val previousActiveIndex = activeItemIndex()
    val previousIndex = itemIndex
    itemIndex = nextItemIndex
    hostLog("prop itemIndex $previousIndex->$nextItemIndex ${diagnosticLabel()}")
    owner?.onFabricCellChanged(this, previousActiveIndex)
  }

  fun setItemId(nextItemId: String) {
    if (itemId == nextItemId) return
    val previousActiveIndex = activeItemIndex()
    val previousItemId = itemId
    itemId = nextItemId
    hostLog("prop itemId $previousItemId->$nextItemId ${diagnosticLabel()}")
    owner?.onFabricCellChanged(this, previousActiveIndex)
  }

  fun setRenderVersion(nextRenderVersion: Int) {
    if (renderVersion == nextRenderVersion) return
    val previousActiveIndex = activeItemIndex()
    val previousRenderVersion = renderVersion
    renderVersion = nextRenderVersion
    hostLog("prop renderVersion $previousRenderVersion->$nextRenderVersion ${diagnosticLabel()}")
    owner?.onFabricCellChanged(this, previousActiveIndex)
  }

  fun setContentType(nextContentType: String) {
    if (contentType == nextContentType) return
    val previousActiveIndex = activeItemIndex()
    val previousContentType = contentType
    contentType = nextContentType
    hostLog("prop contentType $previousContentType->$nextContentType ${diagnosticLabel()}")
    owner?.onFabricCellChanged(this, previousActiveIndex)
  }

  fun setHostSlot(nextHostSlot: String) {
    if (hostSlot == nextHostSlot) return
    val previousHostSlot = hostSlot
    hostSlot = nextHostSlot
    hostLog("prop hostSlot $previousHostSlot->$nextHostSlot ${diagnosticLabel()}")
  }

  fun setMessagePreview(nextMessagePreview: String) {
    val normalizedPreview = nextMessagePreview.replace('\n', ' ').take(120)
    if (messagePreview == normalizedPreview) return
    val previousActiveIndex = activeItemIndex()
    val previousPreview = messagePreview
    messagePreview = normalizedPreview
    hostLog("prop messagePreview [$previousPreview]->[$normalizedPreview] ${diagnosticLabel()}")
    owner?.onFabricCellChanged(this, previousActiveIndex)
  }

  fun addFabricChild(child: View, index: Int) {
    val startNs = SystemClock.elapsedRealtimeNanos()
    super.addView(child, index.coerceIn(0, childCount))
    hostLog(
        "child add ${diagnosticLabel()} child=${child.javaClass.simpleName} " +
            "insertIndex=$index childCount=$childCount durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000}",
    )
    if (BuildConfig.DEBUG) {
      val durationUs = (SystemClock.elapsedRealtimeNanos() - startNs) / 1_000
      Log.d(
          FABRIC_MOUNT_LOG_TAG,
          "fabricChildAdd cell#$cellInstanceId itemIndex=$itemIndex itemId=$itemId " +
              "renderVersion=$renderVersion contentType=$contentType child=${child.javaClass.simpleName} " +
              "childCount=$childCount durationUs=$durationUs",
      )
    }
  }

  fun removeFabricChild(child: View) {
    val startNs = SystemClock.elapsedRealtimeNanos()
    super.removeView(child)
    hostLog(
        "child remove ${diagnosticLabel()} child=${child.javaClass.simpleName} " +
            "childCount=$childCount durationUs=${(SystemClock.elapsedRealtimeNanos() - startNs) / 1_000}",
    )
    if (BuildConfig.DEBUG) {
      val durationUs = (SystemClock.elapsedRealtimeNanos() - startNs) / 1_000
      Log.d(
          FABRIC_MOUNT_LOG_TAG,
          "fabricChildRemove cell#$cellInstanceId itemIndex=$itemIndex itemId=$itemId " +
              "renderVersion=$renderVersion contentType=$contentType child=${child.javaClass.simpleName} " +
              "childCount=$childCount durationUs=$durationUs",
      )
    }
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val widthMode = MeasureSpec.getMode(widthMeasureSpec)
    val widthSize = MeasureSpec.getSize(widthMeasureSpec)
    val resolvedWidth =
        when {
          widthMode == MeasureSpec.UNSPECIFIED && width > 0 -> width
          widthMode == MeasureSpec.UNSPECIFIED && measuredWidth > 0 -> measuredWidth
          else -> widthSize
        }

    val heightMode = MeasureSpec.getMode(heightMeasureSpec)
    val heightSize = MeasureSpec.getSize(heightMeasureSpec)
    val resolvedHeight =
        when {
          heightMode == MeasureSpec.EXACTLY -> heightSize
          preferredMeasuredHeightPx > 0 -> preferredMeasuredHeightPx
          height > 0 -> height
          measuredHeight > 0 -> measuredHeight
          else -> 96
        }

    val exactWidth = MeasureSpec.makeMeasureSpec(max(1, resolvedWidth), MeasureSpec.EXACTLY)
    val exactHeight = MeasureSpec.makeMeasureSpec(max(1, resolvedHeight), MeasureSpec.EXACTLY)
    for (index in 0 until childCount) {
      getChildAt(index).measure(exactWidth, exactHeight)
    }
    setMeasuredDimension(max(1, resolvedWidth), max(1, resolvedHeight))
    hostLog(
        "measure ${diagnosticLabel()} widthSpec=${MeasureSpec.toString(widthMeasureSpec)} " +
            "heightSpec=${MeasureSpec.toString(heightMeasureSpec)} " +
            "resolved=${max(1, resolvedWidth)}x${max(1, resolvedHeight)} " +
            "preferredPx=$preferredMeasuredHeightPx lastReportedPx=$lastReportedHeight " +
            "children=${childSummary()}",
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val childRight = max(1, right - left)
    val childBottom = max(1, bottom - top)
    for (index in 0 until childCount) {
      getChildAt(index).layout(0, 0, childRight, childBottom)
    }
    hostLog(
        "layout changed=$changed ${diagnosticLabel()} bounds=${right - left}x${bottom - top} " +
            "childFrame=${childRight}x$childBottom children=${childSummary()}",
    )
    owner?.onFabricCellLaidOut(this)
    post {
      if (preferredMeasuredHeightPx > 0) return@post

      val measuredContentHeight = measuredContentHeightFromYogaChildren()
      if (measuredContentHeight > 0 && abs(measuredContentHeight - lastReportedHeight) > 1) {
        hostLog(
            "contentHeight yoga ${diagnosticLabel()} measuredPx=$measuredContentHeight " +
                "previousPx=$lastReportedHeight",
        )
        lastReportedHeight = measuredContentHeight
        val activeIndex = activeItemIndex()
        if (activeIndex >= 0) {
          owner?.onFabricCellMeasured(activeIndex, measuredContentHeight)
        } else {
          hostLog("skip measured inactive source=yoga ${diagnosticLabel()} heightPx=$measuredContentHeight")
        }
      }
    }
  }

  fun setMeasuredContentHeightDp(heightDp: Int) {
    if (heightDp <= 0) {
      if (preferredMeasuredHeightPx > 0 || lastReportedHeight > 0) {
        hostLog(
            "prop measuredHeight clear ${diagnosticLabel()} " +
                "previousPx=$preferredMeasuredHeightPx previousReportedPx=$lastReportedHeight",
        )
        val shouldRequestLayout = preferredMeasuredHeightPx > 0
        preferredMeasuredHeightPx = 0
        lastReportedHeight = 0
        if (shouldRequestLayout) {
          requestLayout()
        }
      }
      return
    }
    val heightPx = (heightDp * resources.displayMetrics.density + 0.5f).toInt()
    if (heightPx <= 0) return

    val preferredHeightChanged = abs(heightPx - preferredMeasuredHeightPx) > 1
    preferredMeasuredHeightPx = heightPx
    hostLog(
        "prop measuredHeight heightDp=$heightDp heightPx=$heightPx " +
            "changed=$preferredHeightChanged ${diagnosticLabel()}",
    )
    if (preferredHeightChanged) {
      requestLayout()
    }
    if (abs(heightPx - lastReportedHeight) <= 1) return

    lastReportedHeight = heightPx
    val activeIndex = activeItemIndex()
    if (activeIndex >= 0) {
      owner?.onFabricCellMeasured(activeIndex, heightPx)
    } else {
      hostLog("skip measured inactive source=prop ${diagnosticLabel()} heightPx=$heightPx")
    }
  }

  fun activeItemIndex(): Int =
      if (
          itemIndex >= 0 &&
              itemId.isNotEmpty() &&
              !itemId.startsWith("pool:") &&
              messagePreview.isNotEmpty() &&
              messagePreview != "inactive"
      )
          itemIndex
      else -1

  fun diagnosticLabel(): String =
      "cell#$cellInstanceId slot=${hostSlot.ifEmpty { "unset" }} itemIndex=$itemIndex " +
          "itemId=${itemId.ifEmpty { "unset" }} renderVersion=$renderVersion " +
          "contentType=$contentType preferredPx=$preferredMeasuredHeightPx " +
          "lastReportedPx=$lastReportedHeight measured=${measuredWidth}x$measuredHeight " +
          "laidOut=${width}x$height children=$childCount activeIndex=${activeItemIndex()} " +
          "preview=[$messagePreview]"

  private fun hostLog(message: String) {
    if (Log.isLoggable(FABRIC_HOST_LOG_TAG, Log.DEBUG)) {
      Log.d(FABRIC_HOST_LOG_TAG, message)
    }
  }

  private fun childSummary(): String {
    if (childCount == 0) return "[]"
    return (0 until childCount).joinToString(prefix = "[", postfix = "]") { index ->
      val child = getChildAt(index)
      "$index:${child.javaClass.simpleName} visibility=${child.visibility} " +
          "measured=${child.measuredWidth}x${child.measuredHeight} " +
          "laidOut=${child.width}x${child.height}"
    }
  }

  private fun measuredContentHeightFromYogaChildren(): Int {
    var maxBottom = 0
    for (index in 0 until childCount) {
      maxBottom = max(maxBottom, maxMeasuredDescendantBottom(getChildAt(index), 0, false))
    }
    return maxBottom
  }

  private fun maxMeasuredDescendantBottom(
      view: View,
      offsetY: Int,
      includeSelf: Boolean,
  ): Int {
    val nextOffset = offsetY + view.top
    var maxBottom =
        if (includeSelf || view !is ViewGroup || view.childCount == 0) {
          nextOffset + view.height
        } else {
          0
        }
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) {
        maxBottom = max(
            maxBottom,
            maxMeasuredDescendantBottom(view.getChildAt(index), nextOffset, true),
        )
      }
    }
    return maxBottom
  }
}

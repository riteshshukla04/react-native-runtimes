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
    val previousIndex = itemIndex
    itemIndex = nextItemIndex
    owner?.onFabricCellChanged(this, previousIndex)
  }

  fun setItemId(nextItemId: String) {
    if (itemId == nextItemId) return
    itemId = nextItemId
    owner?.onFabricCellChanged(this, itemIndex)
  }

  fun setRenderVersion(nextRenderVersion: Int) {
    if (renderVersion == nextRenderVersion) return
    renderVersion = nextRenderVersion
    owner?.onFabricCellChanged(this, itemIndex)
  }

  fun setContentType(nextContentType: String) {
    if (contentType == nextContentType) return
    contentType = nextContentType
    owner?.onFabricCellChanged(this, itemIndex)
  }

  fun addFabricChild(child: View, index: Int) {
    val startNs = SystemClock.elapsedRealtimeNanos()
    super.addView(child, index.coerceIn(0, childCount))
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
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val childRight = max(1, right - left)
    val childBottom = max(1, bottom - top)
    for (index in 0 until childCount) {
      getChildAt(index).layout(0, 0, childRight, childBottom)
    }
    owner?.onFabricCellLaidOut(this)
    post {
      if (preferredMeasuredHeightPx > 0) return@post

      val measuredContentHeight = measuredContentHeightFromYogaChildren()
      if (measuredContentHeight > 0 && abs(measuredContentHeight - lastReportedHeight) > 1) {
        lastReportedHeight = measuredContentHeight
        owner?.onFabricCellMeasured(itemIndex, measuredContentHeight)
      }
    }
  }

  fun setMeasuredContentHeightDp(heightDp: Int) {
    if (heightDp <= 0) {
      if (preferredMeasuredHeightPx > 0) {
        preferredMeasuredHeightPx = 0
        requestLayout()
      }
      return
    }
    val heightPx = (heightDp * resources.displayMetrics.density + 0.5f).toInt()
    if (heightPx <= 0) return

    val preferredHeightChanged = abs(heightPx - preferredMeasuredHeightPx) > 1
    preferredMeasuredHeightPx = heightPx
    if (preferredHeightChanged) {
      requestLayout()
    }
    if (abs(heightPx - lastReportedHeight) <= 1) return

    lastReportedHeight = heightPx
    owner?.onFabricCellMeasured(itemIndex, heightPx)
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
